// Universal HTTPS/WSS Port-443 Media Relay Fallback
// Automatically activates if WebRTC ICE cannot traverse strict 4G/symmetric carrier NAT (CGNAT) without TURN,
// or if WebRTC audio connects while video frames stall on mobile hardware encoders / poor 4G.

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export class WsMediaAudioPlayer {
  private ctx: AudioContext | null = null;
  private nextTimeByPeer = new Map<string, number>();
  private onBlockedChange?: (blocked: boolean) => void;

  constructor(onBlockedChange?: (blocked: boolean) => void) {
    this.onBlockedChange = onBlockedChange;
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.onBlockedChange?.(true);
    } else {
      this.onBlockedChange?.(false);
    }
    return this.ctx;
  }

  async unlock(): Promise<boolean> {
    const ctx = this.ensureContext();
    if (!ctx) return false;
    try {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      const ok = ctx.state === 'running';
      this.onBlockedChange?.(!ok);
      return ok;
    } catch {
      this.onBlockedChange?.(true);
      return false;
    }
  }

  playChunk(peerId: string, pcm16Base64: string, sampleRate = 16000, isMuted = false) {
    if (isMuted || !pcm16Base64) return;
    const ctx = this.ensureContext();
    if (!ctx || ctx.state !== 'running') {
      if (ctx?.state === 'suspended') {
        ctx.resume().then(() => this.onBlockedChange?.(false)).catch(() => this.onBlockedChange?.(true));
      }
      return;
    }

    try {
      const rawBytes = base64ToUint8(pcm16Base64);
      const int16 = new Int16Array(rawBytes.buffer, rawBytes.byteOffset, Math.floor(rawBytes.byteLength / 2));
      if (int16.length === 0) return;

      const audioBuffer = ctx.createBuffer(1, int16.length, sampleRate);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < int16.length; i++) {
        channelData[i] = int16[i] / 32768;
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const now = ctx.currentTime;
      let startAt = this.nextTimeByPeer.get(peerId) || now + 0.05;
      if (startAt < now) {
        startAt = now + 0.03;
      } else if (startAt > now + 0.45) {
        // Prevent accumulating multi-second audio drift
        startAt = now + 0.06;
      }
      source.start(startAt);
      this.nextTimeByPeer.set(peerId, startAt + audioBuffer.duration);
    } catch {}
  }

  dispose() {
    this.nextTimeByPeer.clear();
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
  }
}

export interface WsRelaySenderOptions {
  roomId: string;
  getWs: () => WebSocket | null;
  getVideoElement: () => HTMLVideoElement | null;
  getLocalStream: () => MediaStream | null;
  isVideoEnabled: () => boolean;
  isMicEnabled: () => boolean;
  shouldSendVideo?: () => boolean;
  shouldSendAudio?: () => boolean;
}

export class WsMediaSender {
  private opts: WsRelaySenderOptions;
  private videoTimer: number | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private fallbackVideo: HTMLVideoElement | null = null;
  private audioCtx: AudioContext | null = null;
  private audioSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private muteGain: GainNode | null = null;
  private attachedStreamId: string | null = null;
  private running = false;

  constructor(opts: WsRelaySenderOptions) {
    this.opts = opts;
  }

  start() {
    if (this.running) return;
    this.running = true;

    this.videoTimer = window.setInterval(() => {
      if (!this.running) return;
      this.sendVideoFrame();
      this.ensureAudioCapture();
    }, 140);

    this.ensureAudioCapture();
  }

  private resolveReadyVideoElement(): HTMLVideoElement | null {
    const domVideo = this.opts.getVideoElement();
    if (domVideo && domVideo.readyState >= 2 && domVideo.videoWidth > 0) {
      return domVideo;
    }

    const stream = this.opts.getLocalStream();
    if (!stream || stream.getVideoTracks().length === 0 || typeof document === 'undefined') {
      return null;
    }

    if (!this.fallbackVideo) {
      const vid = document.createElement('video');
      vid.muted = true;
      vid.playsInline = true;
      vid.autoplay = true;
      this.fallbackVideo = vid;
    }
    if (this.fallbackVideo.srcObject !== stream) {
      this.fallbackVideo.srcObject = stream;
      this.fallbackVideo.play().catch(() => {});
    }
    if (this.fallbackVideo.readyState >= 2 && this.fallbackVideo.videoWidth > 0) {
      return this.fallbackVideo;
    }
    return null;
  }

  private sendVideoFrame() {
    if (this.opts.shouldSendVideo && !this.opts.shouldSendVideo()) return;
    if (!this.opts.isVideoEnabled()) return;

    const ws = this.opts.getWs();
    if (!ws || ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 160_000) return;

    const videoEl = this.resolveReadyVideoElement();
    if (!videoEl) return;

    try {
      if (!this.canvas) {
        this.canvas = document.createElement('canvas');
      }
      const targetW = 360;
      const ratio = videoEl.videoHeight > 0 ? videoEl.videoHeight / videoEl.videoWidth : 0.75;
      const targetH = Math.max(200, Math.round(targetW * ratio));
      if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
        this.canvas.width = targetW;
        this.canvas.height = targetH;
      }
      const ctx = this.canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(videoEl, 0, 0, targetW, targetH);
      const frame = this.canvas.toDataURL('image/jpeg', 0.62);
      ws.send(
        JSON.stringify({
          type: 'ws-video-frame',
          roomId: this.opts.roomId,
          frame,
          isVideoOn: true,
        })
      );
    } catch {}
  }

  ensureAudioCapture() {
    if (!this.running) return;
    if (this.opts.shouldSendAudio && !this.opts.shouldSendAudio()) {
      return;
    }
    const stream = this.opts.getLocalStream();
    if (!stream || stream.getAudioTracks().length === 0) return;

    if (this.attachedStreamId === stream.id && this.audioCtx) {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      return;
    }

    this.teardownAudio();
    this.attachedStreamId = stream.id;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      this.audioCtx = ctx;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const audioOnlyStream = new MediaStream(stream.getAudioTracks());
      const source = ctx.createMediaStreamSource(audioOnlyStream);
      const processor = ctx.createScriptProcessor(2048, 1, 1);
      const muteGain = ctx.createGain();
      muteGain.gain.value = 0;

      const targetRate = 16000;
      const srcRate = ctx.sampleRate || 48000;
      const ratio = srcRate / targetRate;

      processor.onaudioprocess = (ev) => {
        if (!this.running || !this.opts.isMicEnabled()) return;
        if (this.opts.shouldSendAudio && !this.opts.shouldSendAudio()) return;
        const ws = this.opts.getWs();
        if (!ws || ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 140_000) return;

        const input = ev.inputBuffer.getChannelData(0);
        const outLen = Math.floor(input.length / ratio);
        if (outLen <= 0) return;

        const pcm16 = new Int16Array(outLen);
        let energy = 0;
        for (let i = 0; i < outLen; i++) {
          const sample = Math.max(-1, Math.min(1, input[Math.floor(i * ratio)] || 0));
          energy += Math.abs(sample);
          pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        }
        // Skip near-silent background frames to save mobile data
        if (energy / outLen < 0.0015) return;

        const b64 = uint8ToBase64(new Uint8Array(pcm16.buffer));
        ws.send(
          JSON.stringify({
            type: 'ws-audio-chunk',
            roomId: this.opts.roomId,
            pcm16: b64,
            sr: targetRate,
          })
        );
      };

      source.connect(processor);
      processor.connect(muteGain);
      muteGain.connect(ctx.destination);

      this.audioSource = source;
      this.processor = processor;
      this.muteGain = muteGain;
    } catch {}
  }

  private teardownAudio() {
    try {
      this.processor?.disconnect();
      this.audioSource?.disconnect();
      this.muteGain?.disconnect();
      if (this.audioCtx && this.audioCtx.state !== 'closed') {
        this.audioCtx.close().catch(() => {});
      }
    } catch {}
    this.processor = null;
    this.audioSource = null;
    this.muteGain = null;
    this.audioCtx = null;
    this.attachedStreamId = null;
  }

  stop() {
    this.running = false;
    if (this.videoTimer !== null) {
      clearInterval(this.videoTimer);
      this.videoTimer = null;
    }
    if (this.fallbackVideo) {
      this.fallbackVideo.srcObject = null;
      this.fallbackVideo = null;
    }
    this.teardownAudio();
  }
}

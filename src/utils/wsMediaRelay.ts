// Universal HTTPS/WSS Port-443 Media Relay Fallback
// Features continuous ring-buffer jitter smoothing, anti-aliased downsampling, soft VAD hangover,
// and strict audio-over-video WebSocket prioritization so voices stay crystal clear on mobile 3G/4G.

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

interface PeerAudioQueue {
  buffer: Float32Array;
  capacity: number;
  readPos: number;
  writePos: number;
  bufferedSamples: number;
  primed: boolean;
  lastChunkAt: number;
  fadeInRemaining: number;
}

export class WsMediaAudioPlayer {
  private ctx: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private silentSource: GainNode | null = null;
  private peerQueues = new Map<string, PeerAudioQueue>();
  private onBlockedChange?: (blocked: boolean) => void;
  private globalMuted = false;

  constructor(onBlockedChange?: (blocked: boolean) => void) {
    this.onBlockedChange = onBlockedChange;
  }

  private ensurePipeline(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }

    if (!this.processor && this.ctx) {
      try {
        const ctx = this.ctx;
        // Continuous single output stream eliminates per-chunk BufferSource gaps & clicks
        const processor = ctx.createScriptProcessor(1024, 1, 1);
        const silentInput = ctx.createGain();
        silentInput.gain.value = 0;

        const outSampleRate = ctx.sampleRate || 48000;
        const targetJitterSamples = Math.round(outSampleRate * 0.045); // 45ms ultra-fast start jitter cushion
        const maxBufferSamples = Math.round(outSampleRate * 0.35);
        const fadeLen = Math.round(outSampleRate * 0.006); // 6ms smooth fade

        processor.onaudioprocess = (ev) => {
          const out = ev.outputBuffer.getChannelData(0);
          out.fill(0);
          const nowMs = Date.now();

          for (const [peerId, q] of this.peerQueues.entries()) {
            if (nowMs - q.lastChunkAt > 10000 && q.bufferedSamples === 0) {
              this.peerQueues.delete(peerId);
              continue;
            }

            if (this.globalMuted) {
              // Drain quietly when muted so stale audio never accumulates
              const drop = Math.min(q.bufferedSamples, out.length);
              q.readPos = (q.readPos + drop) % q.capacity;
              q.bufferedSamples -= drop;
              if (q.bufferedSamples === 0) q.primed = false;
              continue;
            }

            if (!q.primed) {
              if (q.bufferedSamples >= targetJitterSamples || (q.bufferedSamples > 0 && nowMs - q.lastChunkAt > 75)) {
                q.primed = true;
                q.fadeInRemaining = fadeLen;
              } else {
                continue;
              }
            }

            // Cap excessive latency buildup smoothly
            if (q.bufferedSamples > maxBufferSamples) {
              const trim = q.bufferedSamples - targetJitterSamples;
              q.readPos = (q.readPos + trim) % q.capacity;
              q.bufferedSamples -= trim;
              q.fadeInRemaining = fadeLen;
            }

            const toRead = Math.min(q.bufferedSamples, out.length);
            if (toRead === 0) {
              q.primed = false;
              continue;
            }

            const underrunAfter = q.bufferedSamples - toRead === 0;
            for (let i = 0; i < toRead; i++) {
              let sample = q.buffer[q.readPos];
              q.readPos = (q.readPos + 1) % q.capacity;

              if (q.fadeInRemaining > 0) {
                const factor = (fadeLen - q.fadeInRemaining + 1) / fadeLen;
                sample *= factor;
                q.fadeInRemaining--;
              }

              // Soft fade-out on trailing edge before entering silence to prevent clicks
              if (underrunAfter && i >= toRead - fadeLen) {
                const remainingTail = toRead - 1 - i;
                sample *= remainingTail / fadeLen;
              }

              out[i] += sample;
            }
            q.bufferedSamples -= toRead;

            if (q.bufferedSamples === 0) {
              q.primed = false;
            }
          }

          // Soft limiter so overlapping speakers never clip harshly
          for (let i = 0; i < out.length; i++) {
            const v = out[i];
            if (v > 0.95 || v < -0.95) {
              out[i] = Math.tanh(v);
            }
          }
        };

        silentInput.connect(processor);
        processor.connect(ctx.destination);
        this.silentSource = silentInput;
        this.processor = processor;
      } catch {}
    }

    if (this.ctx.state === 'suspended') {
      this.onBlockedChange?.(true);
    } else {
      this.onBlockedChange?.(false);
    }
    return this.ctx;
  }

  async unlock(): Promise<boolean> {
    const ctx = this.ensurePipeline();
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
    this.globalMuted = isMuted;
    if (isMuted || !pcm16Base64) return;

    const ctx = this.ensurePipeline();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => this.onBlockedChange?.(false)).catch(() => this.onBlockedChange?.(true));
      return;
    }

    try {
      const rawBytes = base64ToUint8(pcm16Base64);
      const int16 = new Int16Array(rawBytes.buffer, rawBytes.byteOffset, Math.floor(rawBytes.byteLength / 2));
      if (int16.length === 0) return;

      const outSampleRate = ctx.sampleRate || 48000;
      const ratio = outSampleRate / sampleRate;
      const resampledLen = Math.max(1, Math.round(int16.length * ratio));

      let q = this.peerQueues.get(peerId);
      if (!q) {
        const capacity = outSampleRate * 2; // 2-second ring buffer
        q = {
          buffer: new Float32Array(capacity),
          capacity,
          readPos: 0,
          writePos: 0,
          bufferedSamples: 0,
          primed: false,
          lastChunkAt: Date.now(),
          fadeInRemaining: 0,
        };
        this.peerQueues.set(peerId, q);
      }
      q.lastChunkAt = Date.now();

      // Linear interpolation upsampling (16kHz -> device 48kHz/44.1kHz) for warm, distortion-free voice
      for (let i = 0; i < resampledLen; i++) {
        const srcPos = i / ratio;
        const idx0 = Math.min(int16.length - 1, Math.floor(srcPos));
        const idx1 = Math.min(int16.length - 1, idx0 + 1);
        const frac = srcPos - idx0;
        const s0 = int16[idx0] / 32768;
        const s1 = int16[idx1] / 32768;
        const sample = s0 + (s1 - s0) * frac;

        if (q.bufferedSamples >= q.capacity) {
          q.readPos = (q.readPos + 1) % q.capacity;
          q.bufferedSamples--;
        }
        q.buffer[q.writePos] = sample;
        q.writePos = (q.writePos + 1) % q.capacity;
        q.bufferedSamples++;
      }
    } catch {}
  }

  dispose() {
    this.peerQueues.clear();
    try {
      this.processor?.disconnect();
      this.silentSource?.disconnect();
    } catch {}
    this.processor = null;
    this.silentSource = null;
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
  private lastVideoSentAt = 0;
  private canvas: HTMLCanvasElement | null = null;
  private fallbackVideo: HTMLVideoElement | null = null;
  private audioCtx: AudioContext | null = null;
  private audioSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private muteGain: GainNode | null = null;
  private attachedStreamId: string | null = null;
  private lastVoiceActivityAt = 0;
  private running = false;

  constructor(opts: WsRelaySenderOptions) {
    this.opts = opts;
  }

  start() {
    if (this.running) return;
    this.running = true;

    this.videoTimer = window.setInterval(() => {
      if (!this.running) return;
      this.maybeSendVideoFrame();
      this.ensureAudioCapture();
    }, 150);

    this.ensureAudioCapture();
  }

  resumeAudio() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
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

  private maybeSendVideoFrame() {
    if (this.opts.shouldSendVideo && !this.opts.shouldSendVideo()) return;
    if (!this.opts.isVideoEnabled()) return;

    const ws = this.opts.getWs();
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // Prioritize audio packets: throttle or skip JPEG video frames whenever WS buffer starts backing up
    if (ws.bufferedAmount > 45_000) return;
    const now = performance.now();
    const minInterval = ws.bufferedAmount > 15_000 ? 1500 : 800;
    if (now - this.lastVideoSentAt < minInterval) return;

    const videoEl = this.resolveReadyVideoElement();
    if (!videoEl) return;

    try {
      if (!this.canvas) {
        this.canvas = document.createElement('canvas');
      }
      const targetW = 320;
      const ratio = videoEl.videoHeight > 0 ? videoEl.videoHeight / videoEl.videoWidth : 0.75;
      const targetH = Math.max(180, Math.round(targetW * ratio));
      if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
        this.canvas.width = targetW;
        this.canvas.height = targetH;
      }
      const ctx = this.canvas.getContext('2d');
      if (!ctx) return;
      if ('filter' in ctx) {
        ctx.filter = 'brightness(1.12) contrast(1.06) saturate(1.06)';
      }
      ctx.drawImage(videoEl, 0, 0, targetW, targetH);
      const frame = this.canvas.toDataURL('image/jpeg', 0.25);
      this.lastVideoSentAt = now;
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
      // 2048 samples (~42ms @ 48kHz) delivers fast voice startup while keeping framing overhead low
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
        if (!ws || ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 280_000) return;

        const input = ev.inputBuffer.getChannelData(0);
        const outLen = Math.floor(input.length / ratio);
        if (outLen <= 0) return;

        const pcm16 = new Int16Array(outLen);
        let energySum = 0;
        let peak = 0;

        // Box-averaging anti-aliased downsample preserves natural speech timbre
        for (let i = 0; i < outLen; i++) {
          const startIdx = Math.floor(i * ratio);
          const endIdx = Math.min(input.length, Math.max(startIdx + 1, Math.floor((i + 1) * ratio)));
          let acc = 0;
          for (let j = startIdx; j < endIdx; j++) {
            acc += input[j];
          }
          const avgSample = Math.max(-1, Math.min(1, acc / (endIdx - startIdx)));
          const absVal = Math.abs(avgSample);
          energySum += absVal;
          if (absVal > peak) peak = absVal;
          pcm16[i] = avgSample < 0 ? avgSample * 0x8000 : avgSample * 0x7fff;
        }

        const nowMs = performance.now();
        const avgEnergy = energySum / outLen;
        if (avgEnergy >= 0.00025 || peak >= 0.002) {
          this.lastVoiceActivityAt = nowMs;
        }
        // Keep streaming 900ms after last speech syllable so word endings/pauses are NEVER clipped
        if (nowMs - this.lastVoiceActivityAt > 900) return;

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

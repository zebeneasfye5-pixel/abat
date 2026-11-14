import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Hand,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Users,
  Send,
  MessageSquare,
  Share2,
  Smile,
  Shield,
  PhoneOff,
  LayoutGrid,
  Square,
  Pin,
  RefreshCw,
  Copy,
  Check,
  Wifi,
  AlertTriangle,
  Sparkles,
  ArrowUpCircle,
  ArrowDownCircle,
} from 'lucide-react';
import { UserProfile } from '../types';
import { fetchLiveKitToken, fetchWebRTCConfig, getRealtimeWsUrl } from '../services/api';
import { toggleSpiritualHymn, stopSpiritualHymn, playChurchBell } from '../utils/audio';

interface AssemblyHallProps {
  user: UserProfile;
  onLeaveMeeting?: () => void;
}

type VideoQualityPreset = '1080p' | '720p' | '360p';

const QUALITY_MAP: Record<VideoQualityPreset, { width: number; height: number; maxBitrate: number; label: string }> = {
  '1080p': { width: 1920, height: 1080, maxBitrate: 2_500_000, label: 'Full HD 1080p' },
  '720p': { width: 1280, height: 720, maxBitrate: 1_200_000, label: 'HD 720p' },
  '360p': { width: 640, height: 360, maxBitrate: 450_000, label: 'ፈጣን 360p' },
};

interface RemotePeer {
  peerId: string;
  userName: string;
  baptismalName: string;
  role: string;
  stream: MediaStream | null;
  connectionState: string;
  isMicOn: boolean;
  isVideoOn: boolean;
  isHandRaised: boolean;
  isScreenSharing: boolean;
  onStage?: boolean;
}

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  time: string;
  isPriest?: boolean;
}

interface FloatingReaction {
  id: number;
  emoji: string;
  sender: string;
  x: number;
}

async function applyStudioEncoderTuning(pc: RTCPeerConnection, quality: VideoQualityPreset) {
  const targetBitrate = QUALITY_MAP[quality].maxBitrate;
  for (const sender of pc.getSenders()) {
    if (!sender.track) continue;
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      if (sender.track.kind === 'video') {
        params.encodings[0].maxBitrate = targetBitrate;
        params.encodings[0].maxFramerate = 30;
        (params as any).degradationPreference = 'maintain-framerate';
      } else if (sender.track.kind === 'audio') {
        params.encodings[0].maxBitrate = 96_000;
      }
      await sender.setParameters(params);
    } catch {
      // Browser may skip unsupported RTCRtpEncodingParameters gracefully
    }
  }
}

// Sub-component for reliable high-res remote video/audio attachment + per-video fullscreen
const RemoteVideoTile: React.FC<{
  peer: RemotePeer;
  isGlobalAudioMuted: boolean;
  isPinned: boolean;
  isExpanded: boolean;
  onPin: (peerId: string) => void;
  onToggleExpand: (peerId: string) => void;
  tallStage?: boolean;
}> = ({ peer, isGlobalAudioMuted, isPinned, isExpanded, onPin, onToggleExpand, tallStage }) => {
  const tileRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [needsPlayTap, setNeedsPlayTap] = useState(false);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (videoEl && peer.stream) {
      if (videoEl.srcObject !== peer.stream) {
        videoEl.srcObject = peer.stream;
      }
      videoEl
        .play()
        .then(() => setNeedsPlayTap(false))
        .catch(() => setNeedsPlayTap(true));
    }
  }, [peer.stream, peer.isVideoOn]);

  const handleTileFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      if (isExpanded) onToggleExpand(peer.peerId);
      return;
    }
    onToggleExpand(peer.peerId);
    const el = tileRef.current;
    const vid = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (el?.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    } else if (vid?.webkitEnterFullscreen) {
      try {
        vid.webkitEnterFullscreen();
      } catch {}
    }
  };

  const isConnected = peer.connectionState === 'connected' || peer.connectionState === 'completed';

  return (
    <div
      ref={tileRef}
      className={`overflow-hidden bg-stone-950 border-2 transition-all shadow-2xl flex flex-col justify-between ${
        isExpanded
          ? 'fixed inset-0 z-50 rounded-none border-amber-500 h-screen w-screen'
          : tallStage
          ? 'relative rounded-2xl min-h-[420px] sm:min-h-[540px] lg:min-h-[620px]'
          : 'relative rounded-2xl min-h-[320px] sm:min-h-[400px]'
      } ${
        peer.isMicOn && isConnected
          ? 'border-emerald-500 ring-2 ring-emerald-500/40'
          : peer.isHandRaised
          ? 'border-amber-400 ring-2 ring-amber-400/40'
          : 'border-stone-800'
      }`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isGlobalAudioMuted}
        className={`absolute inset-0 w-full h-full object-cover contrast-[1.03] saturate-[1.06] ${
          peer.stream && peer.isVideoOn ? 'block' : 'hidden'
        }`}
      />

      {(!peer.stream || !peer.isVideoOn) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-900/95 text-stone-300 p-4 text-center">
          <div className="w-16 h-16 rounded-full bg-amber-950 border-2 border-amber-500/60 flex items-center justify-center text-xl font-extrabold text-amber-200 mb-2">
            {(peer.baptismalName || peer.userName || 'ተ').charAt(0)}
          </div>
          <p className="text-sm font-extrabold text-amber-200">{peer.baptismalName || peer.userName}</p>
          <p className="text-xs text-stone-300 mt-1">
            {!peer.stream ? 'ከፍተኛ ጥራት HD ቪዲዮ በመገናኘት ላይ...' : 'ካሜራ ዘግተዋል'}
          </p>
        </div>
      )}

      {needsPlayTap && peer.stream && (
        <button
          onClick={() => {
            videoRef.current?.play().then(() => setNeedsPlayTap(false)).catch(() => {});
          }}
          className="absolute inset-0 z-20 bg-black/75 flex flex-col items-center justify-center text-amber-200 text-xs font-extrabold gap-2"
        >
          <Volume2 className="w-8 h-8 text-amber-400 animate-pulse" />
          <span>ድምፅና ምስል ለማብራት ይንኩ (Tap to Play)</span>
        </button>
      )}

      {/* Top Info */}
      <div className="relative z-10 p-3 flex items-center justify-between gap-2 bg-gradient-to-b from-black/75 via-black/30 to-transparent">
        <div className="flex items-center gap-1.5 bg-stone-950/90 backdrop-blur-md px-3 py-1 rounded-lg border border-stone-700 text-xs text-amber-200 truncate">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isConnected ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
            }`}
          />
          <span className="font-extrabold truncate">
            {peer.baptismalName || peer.userName}
            {peer.role === 'priest' ? ' (ቀሲስ)' : ''}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {peer.isHandRaised && (
            <div className="flex items-center gap-1 bg-amber-500 text-stone-950 px-2.5 py-0.5 rounded-lg text-[11px] font-extrabold animate-bounce shadow">
              <Hand className="w-3 h-3" />
              <span>ሀሳብ አለኝ</span>
            </div>
          )}
          <button
            onClick={() => onPin(peer.peerId)}
            className={`p-1.5 rounded-lg border transition ${
              isPinned
                ? 'bg-amber-600 text-stone-950 border-amber-400'
                : 'bg-stone-900/90 text-stone-200 border-stone-700 hover:text-amber-200'
            }`}
            title="ዋና ስክሪን አድርግ"
          >
            <Pin className="w-4 h-4" />
          </button>
          <button
            onClick={handleTileFullscreen}
            className="p-1.5 rounded-lg bg-stone-900/90 text-amber-200 border border-amber-600/60 hover:bg-amber-700 hover:text-stone-950 transition"
            title={isExpanded ? 'ሙሉ ስክሪን ዝጋ' : 'ሙሉ ስክሪን ክፈት'}
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Bottom Info */}
      <div className="relative z-10 p-3 flex items-center justify-between bg-gradient-to-t from-black/90 via-black/45 to-transparent text-xs">
        <div className="flex items-center gap-2">
          <span
            className={`p-1.5 rounded-md border ${
              peer.isMicOn
                ? 'bg-emerald-950/90 border-emerald-500 text-emerald-300'
                : 'bg-red-950/90 border-red-700 text-red-300'
            }`}
          >
            {peer.isMicOn ? <Mic className="w-3.5 h-3.5 animate-pulse" /> : <MicOff className="w-3.5 h-3.5" />}
          </span>
          <span className="text-stone-200 font-bold">
            {peer.isScreenSharing ? 'ስክሪን እያጋሩ ነው' : peer.isMicOn ? 'እየተናገሩ ነው' : 'ማይክ ዝግ ነው'}
          </span>
        </div>

        <span
          className={`px-2 py-0.5 rounded font-mono text-[11px] font-bold ${
            isConnected
              ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-700/60'
              : 'bg-amber-950/90 text-amber-300 border border-amber-700/60'
          }`}
        >
          {isConnected ? 'ቀጥታ Full HD' : peer.connectionState}
        </span>
      </div>
    </div>
  );
};

export const AssemblyHall: React.FC<AssemblyHallProps> = ({ user, onLeaveMeeting }) => {
  const ROOM_ID = 'assembly-zoom-main';

  const [viewMode, setViewMode] = useState<'gallery' | 'speaker'>('gallery');
  const [activeTabPanel, setActiveTabPanel] = useState<'chat' | 'participants' | 'none'>('chat');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [expandedTileId, setExpandedTileId] = useState<string | null>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [videoQuality, setVideoQuality] = useState<VideoQualityPreset>('1080p');

  // Scalability & SFU Telemetry state
  const [broadcastMode, setBroadcastMode] = useState<'interactive-mesh' | 'stage-broadcast' | 'livekit-sfu'>('interactive-mesh');
  const [selfOnStage, setSelfOnStage] = useState(true);
  const [serverClientCount, setServerClientCount] = useState<number>(1);

  // Media state
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [myVolume, setMyVolume] = useState(0);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [audioHymnPlaying, setAudioHymnPlaying] = useState(false);
  const [isGlobalAudioMuted, setIsGlobalAudioMuted] = useState(false);
  const [mediaWarning, setMediaWarning] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  // Real Connected Remote Peers
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [pinnedPeerId, setPinnedPeerId] = useState<string | null>(null);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newChatText, setNewChatText] = useState('');
  const [showReactionsMenu, setShowReactionsMenu] = useState(false);

  // Refs
  const selfPeerIdRef = useRef<string>(user.id || `peer-${Math.random().toString(36).slice(2, 9)}`);
  const selfTileRef = useRef<HTMLDivElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const liveKitRoomRef = useRef<any>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const rtcConfigRef = useRef<RTCConfiguration>({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ],
  });
  const isMicOnRef = useRef(isMicOn);
  isMicOnRef.current = isMicOn;
  const videoQualityRef = useRef<VideoQualityPreset>(videoQuality);
  videoQualityRef.current = videoQuality;

  const meetingContainerRef = useRef<HTMLDivElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const triggerReaction = useCallback((emoji: string, sender: string) => {
    const id = Date.now() + Math.random();
    const x = Math.floor(15 + Math.random() * 70);
    setFloatingReactions((prev) => [...prev, { id, emoji, sender, x }]);
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2800);
  }, []);

  const createPeerConnection = useCallback((targetPeerId: string) => {
    const existing = peerConnectionsRef.current.get(targetPeerId);
    if (existing) {
      return existing;
    }

    const pc = new RTCPeerConnection(rtcConfigRef.current);
    peerConnectionsRef.current.set(targetPeerId, pc);

    const localStream = localStreamRef.current;
    if (localStream && localStream.getTracks().length > 0) {
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
      if (localStream.getVideoTracks().length === 0) {
        pc.addTransceiver('video', { direction: 'recvonly' });
      }
      if (localStream.getAudioTracks().length === 0) {
        pc.addTransceiver('audio', { direction: 'recvonly' });
      }
      applyStudioEncoderTuning(pc, videoQualityRef.current);
    } else {
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'webrtc-signal',
            roomId: ROOM_ID,
            targetPeerId,
            signal: { candidate: event.candidate },
          })
        );
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
      setRemotePeers((prev) =>
        prev.map((p) => (p.peerId === targetPeerId ? { ...p, stream } : p))
      );
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      setRemotePeers((prev) =>
        prev.map((p) => (p.peerId === targetPeerId ? { ...p, connectionState: state } : p))
      );
      if (state === 'failed') {
        try {
          pc.restartIce();
        } catch {}
      }
    };

    return pc;
  }, []);

  const flushIceCandidates = async (peerId: string, pc: RTCPeerConnection) => {
    const queue = pendingIceRef.current.get(peerId) || [];
    if (queue.length === 0) return;
    pendingIceRef.current.set(peerId, []);
    for (const cand of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch {}
    }
  };

  // Boot sequence: 1) High-Def 1080p Camera + 48kHz Studio Audio, 2) WebRTC / LiveKit SFU, 3) Signaling WS
  useEffect(() => {
    let isCancelled = false;

    const boot = async () => {
      const extConfig = await fetchWebRTCConfig();
      rtcConfigRef.current = { iceServers: extConfig.iceServers };

      // 1. Acquire Full HD 1080p Video & 48kHz Studio Audio with progressive fallback
      let acquiredStream: MediaStream | null = null;
      const hdAudioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 48000,
      };
      try {
        acquiredStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1920, min: 640 },
            height: { ideal: 1080, min: 480 },
            frameRate: { ideal: 30, min: 15 },
          },
          audio: hdAudioConstraints,
        });
      } catch {
        try {
          acquiredStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
        } catch {
          try {
            acquiredStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            setIsVideoOn(false);
            setMediaWarning('ካሜራ አልተገኘም ወይም አልተፈቀደም፤ በድምፅ ብቻ ተቀላቅለዋል።');
          } catch {
            setIsVideoOn(false);
            setIsMicOn(false);
            setMediaWarning('ካሜራ እና ማይክራፎን አልተፈቀደም፤ እንደ ተመልካች (Viewer Mode) ተቀላቅለዋል።');
          }
        }
      }

      if (isCancelled) {
        acquiredStream?.getTracks().forEach((t) => t.stop());
        return;
      }

      if (acquiredStream) {
        localStreamRef.current = acquiredStream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = acquiredStream;
          localVideoRef.current.play().catch(() => {});
        }

        // Studio Mic Meter
        try {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AudioCtx();
          audioContextRef.current = ctx;
          const source = ctx.createMediaStreamSource(acquiredStream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          analyserRef.current = analyser;
          source.connect(analyser);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateVol = () => {
            if (isCancelled) return;
            if (analyserRef.current && isMicOnRef.current) {
              analyserRef.current.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
              setMyVolume(Math.min(100, Math.round((sum / dataArray.length / 128) * 100)));
            } else {
              setMyVolume(0);
            }
            animFrameRef.current = requestAnimationFrame(updateVol);
          };
          updateVol();
        } catch {}
      }

      // 2. If LiveKit Enterprise SFU is configured on server, use SFU for 1,000 - 10,000+ concurrent viewers!
      if (extConfig.sfuConfigured) {
        try {
          const lkData = await fetchLiveKitToken(
            ROOM_ID,
            selfPeerIdRef.current,
            user.baptismalName || user.fullName || 'ተሳታፊ',
            true
          );
          if (lkData.sfuConfigured && lkData.url && lkData.token) {
            const { Room, RoomEvent } = await import('livekit-client');
            const lkRoom = new Room({
              adaptiveStream: true,
              dynacast: true,
            });
            liveKitRoomRef.current = lkRoom;

            const syncLkParticipants = () => {
              const list: RemotePeer[] = [];
              lkRoom.remoteParticipants.forEach((rp) => {
                const tracks: MediaStreamTrack[] = [];
                rp.trackPublications.forEach((pub) => {
                  if (pub.track?.mediaStreamTrack) {
                    tracks.push(pub.track.mediaStreamTrack);
                  }
                });
                list.push({
                  peerId: rp.identity,
                  userName: rp.name || rp.identity,
                  baptismalName: rp.name || rp.identity,
                  role: 'attendee',
                  stream: tracks.length > 0 ? new MediaStream(tracks) : null,
                  connectionState: 'connected',
                  isMicOn: rp.isMicrophoneEnabled,
                  isVideoOn: rp.isCameraEnabled,
                  isHandRaised: false,
                  isScreenSharing: rp.isScreenShareEnabled,
                  onStage: true,
                });
              });
              setRemotePeers(list);
              setServerClientCount(1 + lkRoom.remoteParticipants.size);
            };

            lkRoom
              .on(RoomEvent.ParticipantConnected, syncLkParticipants)
              .on(RoomEvent.ParticipantDisconnected, syncLkParticipants)
              .on(RoomEvent.TrackSubscribed, syncLkParticipants)
              .on(RoomEvent.TrackUnsubscribed, syncLkParticipants)
              .on(RoomEvent.TrackMuted, syncLkParticipants)
              .on(RoomEvent.TrackUnmuted, syncLkParticipants);

            await lkRoom.connect(lkData.url, lkData.token);
            if (acquiredStream) {
              for (const t of acquiredStream.getTracks()) {
                await lkRoom.localParticipant.publishTrack(t);
              }
            }
            setBroadcastMode('livekit-sfu');
          }
        } catch (err) {
          console.warn('LiveKit SFU fallback to built-in Relay/Stage WS:', err);
        }
      }

      // 3. Connect High-Scale Anti-Congestion WebSocket Signaling (Chat, Stage Control, Reactions, & Relay Mesh)
      const ws = new WebSocket(getRealtimeWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (isCancelled) {
          ws.close();
          return;
        }
        setWsConnected(true);
        ws.send(
          JSON.stringify({
            type: 'join-room',
            roomId: ROOM_ID,
            userId: selfPeerIdRef.current,
            userName: user.fullName,
            baptismalName: user.baptismalName || user.fullName,
            role: user.role,
            isMicOn: isMicOnRef.current && Boolean(acquiredStream?.getAudioTracks().length),
            isVideoOn: Boolean(acquiredStream?.getVideoTracks().length),
          })
        );
      };

      ws.onclose = () => {
        setWsConnected(false);
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'room-state') {
            if (Array.isArray(data.chatHistory) && data.chatHistory.length > 0) {
              setChatMessages(data.chatHistory);
            }
            if (typeof data.selfOnStage === 'boolean') {
              setSelfOnStage(data.selfOnStage);
            }
            if (data.broadcastMode && !liveKitRoomRef.current) {
              setBroadcastMode(data.broadcastMode);
            }
            if (typeof data.clientCount === 'number') {
              setServerClientCount(data.clientCount);
            }

            if (liveKitRoomRef.current) return;

            const existing: any[] = data.existingPeers || [];
            setRemotePeers(
              existing.map((p) => ({
                peerId: p.peerId,
                userName: p.userName,
                baptismalName: p.baptismalName || p.userName,
                role: p.role,
                stream: null,
                connectionState: 'connecting',
                isMicOn: Boolean(p.isMicOn),
                isVideoOn: Boolean(p.isVideoOn),
                isHandRaised: Boolean(p.isHandRaised),
                isScreenSharing: Boolean(p.isScreenSharing),
                onStage: p.onStage !== false,
              }))
            );

            for (const p of existing) {
              const pc = createPeerConnection(p.peerId);
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              ws.send(
                JSON.stringify({
                  type: 'webrtc-signal',
                  roomId: ROOM_ID,
                  targetPeerId: p.peerId,
                  signal: { sdp: offer },
                })
              );
            }
          } else if (data.type === 'peer-joined' && data.peer) {
            if (typeof data.clientCount === 'number') setServerClientCount(data.clientCount);
            if (data.broadcastMode && !liveKitRoomRef.current) setBroadcastMode(data.broadcastMode);
            if (liveKitRoomRef.current) return;

            const p = data.peer;
            // In Mass Broadcast mode, only connect video feeds for Stage speakers (prevents N x N congestion)
            if (data.broadcastMode === 'stage-broadcast' && !p.onStage && p.role !== 'priest') {
              setRemotePeers((prev) => {
                if (prev.some((x) => x.peerId === p.peerId)) return prev;
                return [
                  ...prev,
                  {
                    peerId: p.peerId,
                    userName: p.userName,
                    baptismalName: p.baptismalName || p.userName,
                    role: p.role,
                    stream: null,
                    connectionState: 'listener',
                    isMicOn: false,
                    isVideoOn: false,
                    isHandRaised: false,
                    isScreenSharing: false,
                    onStage: false,
                  },
                ];
              });
              return;
            }

            setRemotePeers((prev) => {
              if (prev.some((x) => x.peerId === p.peerId)) return prev;
              return [
                ...prev,
                {
                  peerId: p.peerId,
                  userName: p.userName,
                  baptismalName: p.baptismalName || p.userName,
                  role: p.role,
                  stream: null,
                  connectionState: 'connecting',
                  isMicOn: Boolean(p.isMicOn),
                  isVideoOn: Boolean(p.isVideoOn),
                  isHandRaised: Boolean(p.isHandRaised),
                  isScreenSharing: Boolean(p.isScreenSharing),
                  onStage: p.onStage !== false,
                },
              ];
            });
          } else if (data.type === 'webrtc-signal' && data.signal && data.senderPeerId) {
            if (liveKitRoomRef.current) return;
            const senderId = data.senderPeerId;
            const pc = createPeerConnection(senderId);
            const { signal } = data;

            if (signal.sdp) {
              await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
              await flushIceCandidates(senderId, pc);
              if (signal.sdp.type === 'offer') {
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                ws.send(
                  JSON.stringify({
                    type: 'webrtc-signal',
                    roomId: ROOM_ID,
                    targetPeerId: senderId,
                    signal: { sdp: answer },
                  })
                );
              }
            } else if (signal.candidate) {
              if (pc.remoteDescription && pc.remoteDescription.type) {
                await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
              } else {
                const q = pendingIceRef.current.get(senderId) || [];
                q.push(signal.candidate);
                pendingIceRef.current.set(senderId, q);
              }
            }
          } else if (data.type === 'peer-media-state') {
            setRemotePeers((prev) =>
              prev.map((p) =>
                p.peerId === data.peerId
                  ? {
                      ...p,
                      isMicOn: data.isMicOn,
                      isVideoOn: data.isVideoOn,
                      isHandRaised: data.isHandRaised,
                      isScreenSharing: data.isScreenSharing,
                      onStage: data.onStage,
                    }
                  : p
              )
            );
          } else if (data.type === 'stage-updated') {
            if (data.peerId === selfPeerIdRef.current) {
              setSelfOnStage(Boolean(data.onStage));
              if (!data.onStage) {
                setIsMicOn(false);
                localStreamRef.current?.getAudioTracks().forEach((t) => {
                  t.enabled = false;
                });
              }
            } else {
              setRemotePeers((prev) =>
                prev.map((p) => (p.peerId === data.peerId ? { ...p, onStage: Boolean(data.onStage) } : p))
              );
            }
          } else if (data.type === 'peer-left') {
            if (typeof data.clientCount === 'number') setServerClientCount(data.clientCount);
            const pc = peerConnectionsRef.current.get(data.peerId);
            if (pc) {
              pc.close();
              peerConnectionsRef.current.delete(data.peerId);
            }
            pendingIceRef.current.delete(data.peerId);
            setRemotePeers((prev) => prev.filter((p) => p.peerId !== data.peerId));
          } else if (data.type === 'assembly-chat-message') {
            setChatMessages((prev) => [
              ...prev,
              {
                id: data.id || Date.now().toString(),
                sender: data.sender,
                text: data.text,
                time: data.time,
                isPriest: data.isPriest,
              },
            ]);
          } else if (data.type === 'assembly-reaction-broadcast') {
            triggerReaction(data.emoji, data.sender);
          } else if (data.type === 'force-mute') {
            setIsMicOn(false);
            localStreamRef.current?.getAudioTracks().forEach((t) => {
              t.enabled = false;
            });
          }
        } catch (err) {
          console.warn('WS message handle error:', err);
        }
      };
    };

    boot();

    return () => {
      isCancelled = true;
      if (liveKitRoomRef.current) {
        try {
          liveKitRoomRef.current.disconnect();
        } catch {}
        liveKitRoomRef.current = null;
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'leave-room' }));
        wsRef.current.close();
      }
      peerConnectionsRef.current.forEach((pc) => pc.close());
      peerConnectionsRef.current.clear();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      stopSpiritualHymn();
    };
  }, [createPeerConnection, triggerReaction, user.id, user.fullName, user.baptismalName, user.role]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const broadcastMediaState = (
    overrides: Partial<{
      isMicOn: boolean;
      isVideoOn: boolean;
      isHandRaised: boolean;
      isScreenSharing: boolean;
    }>
  ) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'room-media-state',
          isMicOn: overrides.isMicOn ?? isMicOn,
          isVideoOn: overrides.isVideoOn ?? isVideoOn,
          isHandRaised: overrides.isHandRaised ?? isHandRaised,
          isScreenSharing: overrides.isScreenSharing ?? isScreenSharing,
        })
      );
    }
  };

  const handleChangeQuality = async (nextQuality: VideoQualityPreset) => {
    setVideoQuality(nextQuality);
    const spec = QUALITY_MAP[nextQuality];
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack) {
      try {
        await videoTrack.applyConstraints({
          width: { ideal: spec.width },
          height: { ideal: spec.height },
          frameRate: { ideal: 30 },
        });
      } catch {}
    }
    peerConnectionsRef.current.forEach((pc) => {
      applyStudioEncoderTuning(pc, nextQuality);
    });
  };

  const handleToggleMic = () => {
    const tracks = localStreamRef.current?.getAudioTracks() || [];
    if (tracks.length === 0) {
      alert('ማይክራፎን አልተገኘም ወይም በብራውዘርዎ አልተፈቀደም።');
      return;
    }
    const next = !isMicOn;
    tracks.forEach((t) => {
      t.enabled = next;
    });
    setIsMicOn(next);
    if (!next) setMyVolume(0);
    broadcastMediaState({ isMicOn: next });
  };

  const handleToggleVideo = () => {
    const tracks = localStreamRef.current?.getVideoTracks() || [];
    if (tracks.length === 0) {
      alert('ካሜራ አልተገኘም ወይም በብራውዘርዎ አልተፈቀደም።');
      return;
    }
    const next = !isVideoOn;
    tracks.forEach((t) => {
      t.enabled = next;
    });
    setIsVideoOn(next);
    broadcastMediaState({ isVideoOn: next });
  };

  const handleFlipCamera = async () => {
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    const spec = QUALITY_MAP[videoQuality];
    try {
      const newCamStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: nextFacing,
          width: { ideal: spec.width },
          height: { ideal: spec.height },
          frameRate: { ideal: 30 },
        },
      });
      const newVideoTrack = newCamStream.getVideoTracks()[0];
      const oldVideoTrack = localStreamRef.current?.getVideoTracks()[0];

      if (localStreamRef.current && newVideoTrack) {
        if (oldVideoTrack) {
          localStreamRef.current.removeTrack(oldVideoTrack);
          oldVideoTrack.stop();
        }
        localStreamRef.current.addTrack(newVideoTrack);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }
        peerConnectionsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(newVideoTrack).catch(() => {});
          applyStudioEncoderTuning(pc, videoQuality);
        });
        setFacingMode(nextFacing);
      }
    } catch {
      alert('ካሜራ መቀያየር አልተቻለም።');
    }
  };

  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      const camTrack = localStreamRef.current?.getVideoTracks()[0];
      if (camTrack) {
        peerConnectionsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(camTrack).catch(() => {});
        });
        if (localVideoRef.current && localStreamRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }
      }
      setIsScreenSharing(false);
      broadcastMediaState({ isScreenSharing: false });
    } else {
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = displayStream.getVideoTracks()[0];
        screenStreamRef.current = displayStream;

        peerConnectionsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack).catch(() => {});
        });
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = displayStream;
        }
        setIsScreenSharing(true);
        broadcastMediaState({ isScreenSharing: true });

        screenTrack.onended = () => {
          setIsScreenSharing(false);
          broadcastMediaState({ isScreenSharing: false });
          const camTrack = localStreamRef.current?.getVideoTracks()[0];
          if (camTrack) {
            peerConnectionsRef.current.forEach((pc) => {
              const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
              if (sender) sender.replaceTrack(camTrack).catch(() => {});
            });
            if (localVideoRef.current && localStreamRef.current) {
              localVideoRef.current.srcObject = localStreamRef.current;
            }
          }
        };
      } catch {}
    }
  };

  const handleToggleHand = () => {
    const next = !isHandRaised;
    setIsHandRaised(next);
    if (next) {
      playChurchBell();
      triggerReaction('✋', user.baptismalName || user.fullName);
    }
    broadcastMediaState({ isHandRaised: next });
  };

  const handlePromoteStage = (peerId: string, onStage: boolean) => {
    wsRef.current?.send(
      JSON.stringify({
        type: 'stage-control',
        targetPeerId: peerId,
        onStage,
      })
    );
  };

  const handleSendReaction = (emoji: string) => {
    triggerReaction(emoji, user.baptismalName || user.fullName);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'assembly-reaction',
          roomId: ROOM_ID,
          emoji,
          sender: user.baptismalName || user.fullName,
        })
      );
    }
    setShowReactionsMenu(false);
  };

  const sendChatText = (text: string) => {
    if (!text.trim()) return;
    const sender = user.baptismalName || user.fullName;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'assembly-chat',
          roomId: ROOM_ID,
          sender,
          text: text.trim(),
          time,
        })
      );
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatText.trim()) return;
    sendChatText(newChatText);
    setNewChatText('');
  };

  const handleCopyInviteLink = () => {
    navigator.clipboard?.writeText(window.location.origin);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2500);
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      meetingContainerRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleToggleSelfFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      setExpandedTileId(null);
      return;
    }
    if (expandedTileId === 'self') {
      setExpandedTileId(null);
      return;
    }
    setExpandedTileId('self');
    const el = selfTileRef.current;
    const vid = localVideoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (el?.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    } else if (vid?.webkitEnterFullscreen) {
      try {
        vid.webkitEnterFullscreen();
      } catch {}
    }
  };

  const stageRemotePeers = remotePeers.filter((p) => p.onStage !== false || p.role === 'priest' || p.stream !== null);
  const totalLiveParticipants = Math.max(serverClientCount, 1 + remotePeers.length);
  const pinnedPeer = stageRemotePeers.find((p) => p.peerId === pinnedPeerId) || stageRemotePeers[0] || null;
  const isSelfExpanded = expandedTileId === 'self';

  return (
    <div
      ref={meetingContainerRef}
      className="max-w-[1560px] mx-auto px-2 sm:px-4 lg:px-6 py-4 space-y-3 min-h-[calc(100vh-80px)] flex flex-col justify-between bg-stone-950"
    >
      {/* 1. TOP CONFERENCE HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-stone-950/90 border border-amber-800/40 backdrop-blur-md shadow-xl">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-red-950/80 border border-red-700/60 text-red-200 font-extrabold text-xs">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            <span>ቀጥታ HD ዙም ጉባኤ</span>
          </div>
          <h2 className="text-base sm:text-lg font-heading font-extrabold text-amber-100">
            የቀሲስ ሄኖክ የቀጥታ ቪዲዮ አስተምህሮ
          </h2>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-950/70 border border-emerald-700/50 text-[11px] text-emerald-300 font-bold">
            <Sparkles className="w-3 h-3" />
            <span>
              {broadcastMode === 'livekit-sfu'
                ? 'LiveKit SFU (10,000+ Ready)'
                : broadcastMode === 'stage-broadcast'
                ? 'Stage + Audience Anti-Congestion'
                : 'HD 1080p · Studio 48kHz'}
            </span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* HD Quality Selector */}
          <select
            value={videoQuality}
            onChange={(e) => handleChangeQuality(e.target.value as VideoQualityPreset)}
            className="bg-stone-900 border border-amber-700/50 text-amber-200 text-xs font-bold rounded-lg px-2 py-1 focus:outline-none"
            title="የቪዲዮ ጥራት ምረጥ"
          >
            <option value="1080p">Full HD 1080p</option>
            <option value="720p">HD 720p</option>
            <option value="360p">ፈጣን 360p</option>
          </select>

          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold ${
              wsConnected
                ? 'bg-emerald-950/60 border-emerald-700/50 text-emerald-300'
                : 'bg-red-950/60 border-red-700/50 text-red-300'
            }`}
          >
            <Wifi className="w-3.5 h-3.5" />
            <span>{wsConnected ? 'ሰርቨር ዝግጁ ነው' : 'በመገናኘት ላይ...'}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-stone-900 border border-stone-800 text-xs text-amber-200 font-bold">
            <Users className="w-3.5 h-3.5 text-amber-400" />
            <span>{totalLiveParticipants} ቀጥታ ተሳታፊ</span>
          </div>

          <button
            onClick={handleCopyInviteLink}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-950/80 hover:bg-amber-900 border border-amber-600/50 text-amber-200 text-xs font-bold transition"
          >
            {linkCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{linkCopied ? 'ተቀድቷል' : 'ሊንክ ቅዳ'}</span>
          </button>

          <div className="flex items-center p-1 rounded-xl bg-stone-900 border border-stone-800">
            <button
              onClick={() => setViewMode('gallery')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                viewMode === 'gallery' ? 'bg-amber-900/80 text-amber-100' : 'text-stone-400'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ጋለሪ</span>
            </button>
            <button
              onClick={() => setViewMode('speaker')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                viewMode === 'speaker' ? 'bg-amber-900/80 text-amber-100' : 'text-stone-400'
              }`}
            >
              <Square className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ስፒከር</span>
            </button>
          </div>

          <button
            onClick={handleToggleFullscreen}
            title="ሙሉ ስክሪን"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-800/80 hover:bg-amber-700 border border-amber-400/70 text-white text-xs font-extrabold transition"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            <span className="hidden sm:inline">{isFullscreen ? 'ዝጋ' : 'ሙሉ ስክሪን'}</span>
          </button>
        </div>
      </div>

      {mediaWarning && (
        <div className="p-2.5 rounded-xl bg-amber-950/70 border border-amber-700/60 text-xs text-amber-200 font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{mediaWarning}</span>
        </div>
      )}

      {!selfOnStage && (
        <div className="p-2.5 rounded-xl bg-stone-900/90 border border-amber-700/50 text-xs text-amber-200 font-bold flex flex-wrap items-center justify-between gap-2">
          <span>
            🛡️ ጉባኤው በብዙ ተሳታፊዎች እንዳይጨናነቅ በ<b>ተመልካች (Listener Stage)</b> ሁኔታ እየተከታተሉ ነው። ለመናገር <b>«እጅ አውጣ»</b> የሚለውን ይጫኑ።
          </span>
        </div>
      )}

      {/* Floating Animated Reactions */}
      <div className="relative overflow-visible pointer-events-none">
        {floatingReactions.map((r) => (
          <div
            key={r.id}
            className="fixed bottom-24 pointer-events-none z-50 flex items-center gap-1.5 animate-bounce"
            style={{ left: `${r.x}%` }}
          >
            <span className="text-3xl filter drop-shadow-lg">{r.emoji}</span>
            <span className="text-[11px] font-bold bg-stone-950/90 text-amber-200 px-2 py-0.5 rounded border border-amber-700/40">
              {r.sender}
            </span>
          </div>
        ))}
      </div>

      {/* 2. MAIN ZOOM VIDEO STAGE & PARTICIPANT GRID */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-[520px]">
        <div
          className={`${
            activeTabPanel !== 'none' ? 'lg:col-span-8 xl:col-span-9' : 'lg:col-span-12'
          } flex flex-col justify-center space-y-3`}
        >
          {/* GALLERY VIEW (Taller cinema/portrait cards with 1080p HD clarity + individual fullscreen) */}
          {viewMode === 'gallery' && (
            <div
              className={`grid gap-3.5 w-full ${
                stageRemotePeers.length === 0
                  ? 'grid-cols-1 md:grid-cols-2'
                  : stageRemotePeers.length === 1
                  ? 'grid-cols-1 md:grid-cols-2'
                  : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
              }`}
            >
              {/* MY OWN LIVE HD VIDEO TILE */}
              <div
                ref={selfTileRef}
                className={`overflow-hidden bg-stone-950 border-2 transition-all shadow-2xl flex flex-col justify-between ${
                  isSelfExpanded
                    ? 'fixed inset-0 z-50 rounded-none border-amber-500 h-screen w-screen'
                    : 'relative rounded-2xl min-h-[340px] sm:min-h-[450px] lg:min-h-[520px]'
                } ${
                  isMicOn && myVolume > 15
                    ? 'border-emerald-400 ring-2 ring-emerald-400/50'
                    : isHandRaised
                    ? 'border-amber-400 ring-2 ring-amber-400/40'
                    : 'border-amber-700/50'
                }`}
              >
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`absolute inset-0 w-full h-full object-cover contrast-[1.03] saturate-[1.06] brightness-[1.02] ${
                    !isScreenSharing && facingMode === 'user' ? 'mirror' : ''
                  } ${isVideoOn || isScreenSharing ? 'block' : 'hidden'}`}
                />

                {!isVideoOn && !isScreenSharing && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-900 text-stone-300 p-4 text-center">
                    <div className="w-16 h-16 rounded-full bg-stone-800 border-2 border-amber-600/50 flex items-center justify-center text-xl font-extrabold text-amber-200 mb-2">
                      {(user.baptismalName || user.fullName || 'እ').charAt(0)}
                    </div>
                    <p className="text-sm text-stone-200 font-bold">{user.baptismalName} (ካሜራ ዝግ ነው)</p>
                  </div>
                )}

                <div className="relative z-10 p-3 flex items-center justify-between bg-gradient-to-b from-black/70 via-black/25 to-transparent">
                  <div className="flex items-center gap-1.5 bg-stone-950/90 backdrop-blur-md px-3 py-1 rounded-lg border border-amber-600/50 text-xs text-amber-200 font-extrabold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>
                      {user.baptismalName || user.fullName} (እኔ {user.role === 'priest' ? '· ቀሲስ' : ''})
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isHandRaised && (
                      <div className="flex items-center gap-1 bg-amber-500 text-stone-950 px-2.5 py-0.5 rounded-lg text-[11px] font-extrabold animate-bounce shadow">
                        <Hand className="w-3 h-3" />
                        <span>ሀሳብ አለኝ</span>
                      </div>
                    )}
                    <button
                      onClick={handleToggleSelfFullscreen}
                      className="p-1.5 rounded-lg bg-stone-900/90 text-amber-200 border border-amber-600/60 hover:bg-amber-700 hover:text-stone-950 transition"
                      title={isSelfExpanded ? 'ሙሉ ስክሪን ዝጋ' : 'ሙሉ ስክሪን ክፈት'}
                    >
                      {isSelfExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="relative z-10 p-3 flex items-center justify-between bg-gradient-to-t from-black/90 via-black/45 to-transparent">
                  <div className="flex items-center gap-2">
                    <span
                      className={`p-1.5 rounded-md border ${
                        isMicOn
                          ? 'bg-emerald-950/90 border-emerald-500 text-emerald-300'
                          : 'bg-red-950/90 border-red-700 text-red-300'
                      }`}
                    >
                      {isMicOn ? <Mic className="w-3.5 h-3.5 animate-pulse" /> : <MicOff className="w-3.5 h-3.5" />}
                    </span>
                    {isMicOn && (
                      <div className="w-16 h-2 bg-stone-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 transition-all duration-75"
                          style={{ width: `${myVolume}%` }}
                        />
                      </div>
                    )}
                    <span className="text-[11px] text-emerald-300 font-mono font-bold">
                      {QUALITY_MAP[videoQuality].label}
                    </span>
                  </div>
                  <button
                    onClick={handleFlipCamera}
                    className="p-1.5 rounded-lg bg-stone-900/90 text-stone-200 hover:text-amber-200 border border-stone-700 transition"
                    title="ካሜራ ቀይር"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* REAL REMOTE CONNECTED PEERS */}
              {stageRemotePeers.map((peer) => (
                <RemoteVideoTile
                  key={peer.peerId}
                  peer={peer}
                  isGlobalAudioMuted={isGlobalAudioMuted}
                  isPinned={pinnedPeerId === peer.peerId}
                  isExpanded={expandedTileId === peer.peerId}
                  onPin={(id) => {
                    setPinnedPeerId(id);
                    setViewMode('speaker');
                  }}
                  onToggleExpand={(id) => setExpandedTileId((cur) => (cur === id ? null : id))}
                  tallStage={true}
                />
              ))}

              {/* HONEST WAITING CARD */}
              {stageRemotePeers.length === 0 && (
                <div className="rounded-2xl bg-stone-900/50 border-2 border-dashed border-amber-800/40 min-h-[340px] sm:min-h-[450px] lg:min-h-[520px] flex flex-col items-center justify-center p-6 text-center space-y-4">
                  <div className="w-14 h-14 rounded-full bg-amber-950/80 border border-amber-600/40 flex items-center justify-center text-amber-300">
                    <Users className="w-7 h-7" />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-base font-heading font-extrabold text-amber-200">
                      ሌሎች ተሳታፊዎችን በመጠባበቅ ላይ...
                    </p>
                    <p className="text-xs text-stone-300 max-w-xs mx-auto font-semibold">
                      የዚህን ድህረገፅ ሊንክ ለቀሲስ ወይም ለምዕመናን ሲልኩና ሲገቡ ቪዲዮና ድምፃቸው እዚህ በከፍተኛ HD ጥራት ይታያል።
                    </p>
                  </div>
                  <button
                    onClick={handleCopyInviteLink}
                    className="px-5 py-2.5 rounded-xl bg-amber-800 hover:bg-amber-700 border border-amber-500/70 text-white text-xs font-extrabold flex items-center gap-2 transition"
                  >
                    {linkCopied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                    <span>{linkCopied ? 'ሊንኩ ተቀድቷል — ይላኩላቸው' : 'የመግቢያ ሊንክ ቅዳ'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SPEAKER VIEW (Huge Tall Stage + Fullscreen) */}
          {viewMode === 'speaker' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3">
                {pinnedPeer ? (
                  <RemoteVideoTile
                    peer={pinnedPeer}
                    isGlobalAudioMuted={isGlobalAudioMuted}
                    isPinned={true}
                    isExpanded={expandedTileId === pinnedPeer.peerId}
                    onPin={() => setViewMode('gallery')}
                    onToggleExpand={(id) => setExpandedTileId((cur) => (cur === id ? null : id))}
                    tallStage={true}
                  />
                ) : (
                  <div className="p-8 rounded-2xl bg-stone-900/60 border border-amber-800/40 text-center space-y-3 min-h-[420px] flex flex-col items-center justify-center">
                    <p className="text-base text-amber-200 font-extrabold">ሌላ ተናጋሪ ገና አልተቀላቀለም</p>
                    <button
                      onClick={() => setViewMode('gallery')}
                      className="px-5 py-2 rounded-xl bg-amber-800 text-white text-xs font-extrabold"
                    >
                      ወደ ጋለሪ ተመለስ
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 overflow-x-auto pb-2">
                {stageRemotePeers
                  .filter((p) => p.peerId !== pinnedPeer?.peerId)
                  .map((p) => (
                    <div
                      key={p.peerId}
                      onClick={() => setPinnedPeerId(p.peerId)}
                      className="w-52 shrink-0 cursor-pointer"
                    >
                      <RemoteVideoTile
                        peer={p}
                        isGlobalAudioMuted={isGlobalAudioMuted}
                        isPinned={false}
                        isExpanded={expandedTileId === p.peerId}
                        onPin={(id) => setPinnedPeerId(id)}
                        onToggleExpand={(id) => setExpandedTileId((cur) => (cur === id ? null : id))}
                      />
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* 3. RIGHT SIDE PANEL: LIVE CHAT & REAL PARTICIPANTS ROSTER WITH STAGE CONTROL */}
        {activeTabPanel !== 'none' && (
          <div className="lg:col-span-4 xl:col-span-3 flex flex-col h-[520px] rounded-2xl bg-stone-950/90 border border-amber-900/40 overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-2.5 bg-stone-900 border-b border-stone-800">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActiveTabPanel('chat')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition ${
                    activeTabPanel === 'chat'
                      ? 'bg-amber-950 text-amber-200 border border-amber-700/60'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  የቀጥታ ቻት
                </button>
                <button
                  onClick={() => setActiveTabPanel('participants')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition ${
                    activeTabPanel === 'participants'
                      ? 'bg-amber-950 text-amber-200 border border-amber-700/60'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  ተሳታፊዎች ({totalLiveParticipants})
                </button>
              </div>
              <button
                onClick={() => setActiveTabPanel('none')}
                className="text-stone-400 hover:text-stone-200 p-1 rounded font-bold"
              >
                ✕
              </button>
            </div>

            {activeTabPanel === 'chat' && (
              <div className="flex-1 flex flex-col justify-between overflow-hidden">
                <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                  {chatMessages.length === 0 && (
                    <p className="text-xs text-stone-400 text-center py-8 font-bold">
                      መልእክቶችዎ ለሁሉም የጉባኤው ተሳታፊዎች በቀጥታ ይታያሉ።
                    </p>
                  )}
                  {chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-2.5 rounded-xl border text-xs space-y-1 ${
                        msg.isPriest
                          ? 'bg-amber-950/60 border-amber-600/50 text-amber-100'
                          : 'bg-stone-900/80 border-stone-800 text-stone-100'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`font-extrabold ${msg.isPriest ? 'text-amber-300' : 'text-stone-200'}`}>
                          {msg.sender}
                        </span>
                        <span className="text-[10px] text-stone-400 font-mono">{msg.time}</span>
                      </div>
                      <p className="leading-relaxed font-semibold">{msg.text}</p>
                    </div>
                  ))}
                  <div ref={chatBottomRef} />
                </div>

                <div className="p-2 bg-stone-900/80 border-t border-stone-800 flex gap-1.5 overflow-x-auto text-[11px]">
                  {['አሜን!', 'ቃለ ሕይወት ያሰማልን', 'አባታችን ይባርኩን', 'ጸልዩልን'].map((phrase) => (
                    <button
                      key={phrase}
                      onClick={() => sendChatText(phrase)}
                      className="px-2.5 py-1 rounded bg-stone-950 border border-stone-800 hover:border-amber-600/50 text-amber-200 font-bold whitespace-nowrap transition"
                    >
                      {phrase}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleSendMessage} className="p-2.5 bg-stone-950 border-t border-stone-800 flex gap-2">
                  <input
                    type="text"
                    value={newChatText}
                    onChange={(e) => setNewChatText(e.target.value)}
                    placeholder="ሀሳብ ወይም ጥያቄ ይጻፉ..."
                    className="flex-1 bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="submit"
                    className="p-2.5 rounded-xl bg-amber-700 hover:bg-amber-600 text-white transition shadow"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}

            {activeTabPanel === 'participants' && (
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-800/40 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-amber-500 text-stone-950 font-extrabold flex items-center justify-center text-xs">
                      {(user.baptismalName || user.fullName || 'እ').charAt(0)}
                    </div>
                    <div>
                      <p className="font-extrabold text-amber-200">{user.baptismalName || user.fullName} (እኔ)</p>
                      <p className="text-[10px] text-stone-300 font-bold">
                        {user.role === 'priest' ? 'ቀሲስ / አስተማሪ' : selfOnStage ? 'መድረክ ላይ' : 'ተመልካች'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isHandRaised && <Hand className="w-3.5 h-3.5 text-amber-400 animate-bounce" />}
                    {isMicOn ? <Mic className="w-3.5 h-3.5 text-emerald-400" /> : <MicOff className="w-3.5 h-3.5 text-red-400" />}
                  </div>
                </div>

                {remotePeers.map((p) => (
                  <div
                    key={p.peerId}
                    className="p-2.5 rounded-xl bg-stone-900/60 border border-stone-800 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-stone-800 text-amber-200 font-extrabold flex items-center justify-center text-xs shrink-0">
                        {(p.baptismalName || p.userName || 'ተ').charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-stone-100 font-bold truncate">{p.baptismalName || p.userName}</p>
                        <p className="text-[10px] text-stone-400 font-bold">
                          {p.role === 'priest' ? 'ቀሲስ' : p.onStage !== false ? 'መድረክ' : 'ተመልካች'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {user.role === 'priest' && (
                        <button
                          onClick={() => handlePromoteStage(p.peerId, p.onStage === false)}
                          title={p.onStage === false ? 'ወደ መድረክ አውጣ' : 'ከመድረክ አውርድ'}
                          className="p-1 rounded bg-amber-950/70 border border-amber-700/50 text-amber-300 hover:bg-amber-800"
                        >
                          {p.onStage === false ? (
                            <ArrowUpCircle className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowDownCircle className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                      {p.isHandRaised && <Hand className="w-3.5 h-3.5 text-amber-400 animate-bounce" />}
                      {p.isMicOn ? <Mic className="w-3.5 h-3.5 text-emerald-400" /> : <MicOff className="w-3.5 h-3.5 text-stone-500" />}
                    </div>
                  </div>
                ))}

                {user.role === 'priest' && remotePeers.length > 0 && (
                  <button
                    onClick={() => {
                      wsRef.current?.send(JSON.stringify({ type: 'host-mute-all' }));
                    }}
                    className="w-full py-2.5 mt-2 rounded-xl bg-red-950 hover:bg-red-900 border border-red-700 text-red-200 text-xs font-extrabold"
                  >
                    ሁሉንም ማይኮች ዝጋ (Mute All)
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. ZOOM BOTTOM MAIN CONTROL TOOLBAR */}
      <div className="p-3 sm:p-4 rounded-2xl bg-gradient-to-r from-stone-950 via-stone-900 to-stone-950 border-2 border-amber-800/40 shadow-2xl flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleMic}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-extrabold border transition shadow-lg ${
              isMicOn
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400'
                : 'bg-stone-900 hover:bg-stone-800 text-red-300 border-red-800/60'
            }`}
          >
            {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4 text-red-400" />}
            <span className="hidden sm:inline">{isMicOn ? 'ማይክ ክፍት ነው' : 'ማይክ ዝግ ነው'}</span>
          </button>

          <button
            onClick={handleToggleVideo}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-extrabold border transition shadow-lg ${
              isVideoOn
                ? 'bg-stone-900 hover:bg-stone-800 text-stone-100 border-stone-700'
                : 'bg-red-950/80 hover:bg-red-900 text-red-200 border-red-700'
            }`}
          >
            {isVideoOn ? <Video className="w-4 h-4 text-emerald-400" /> : <VideoOff className="w-4 h-4 text-red-400" />}
            <span className="hidden sm:inline">{isVideoOn ? 'ካሜራ በርቷል' : 'ካሜራ ዝግ ነው'}</span>
          </button>

          <button
            onClick={() => setIsGlobalAudioMuted(!isGlobalAudioMuted)}
            className={`p-2.5 rounded-xl border transition ${
              isGlobalAudioMuted
                ? 'bg-red-950 border-red-700 text-red-300'
                : 'bg-stone-900 border-stone-700 text-stone-200 hover:text-amber-200'
            }`}
            title={isGlobalAudioMuted ? 'የተሳታፊዎችን ድምፅ ክፈት' : 'የተሳታፊዎችን ድምፅ ዝጋ'}
          >
            {isGlobalAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleHand}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-extrabold border transition shadow-lg ${
              isHandRaised
                ? 'bg-amber-500 hover:bg-amber-400 text-stone-950 border-amber-300 animate-bounce'
                : 'bg-stone-900 hover:bg-stone-800 text-amber-200 border-amber-700/60'
            }`}
          >
            <Hand className="w-4 h-4" />
            <span>{isHandRaised ? 'እጅ ወጥቷል' : 'እጅ አውጣ'}</span>
          </button>

          <button
            onClick={handleToggleScreenShare}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold border transition hidden sm:flex ${
              isScreenSharing
                ? 'bg-emerald-950 text-emerald-200 border-emerald-500'
                : 'bg-stone-900 hover:bg-stone-800 text-stone-200 border-stone-700'
            }`}
          >
            <Share2 className="w-4 h-4 text-amber-400" />
            <span className="hidden md:inline">{isScreenSharing ? 'ማጋራት አቁም' : 'ስክሪን አጋራ'}</span>
          </button>

          <div className="relative">
            <button
              onClick={() => setShowReactionsMenu(!showReactionsMenu)}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-amber-200 border border-stone-700 text-xs font-bold transition"
            >
              <Smile className="w-4 h-4 text-amber-400" />
              <span className="hidden md:inline">ምላሾች</span>
            </button>

            {showReactionsMenu && (
              <div className="absolute bottom-12 left-1/2 -translate-x-1/2 p-2 bg-stone-950 border border-amber-700/60 rounded-2xl shadow-2xl flex items-center gap-2 z-50">
                {['🙏', '✝️', '❤️', '👏', '💡'].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleSendReaction(emoji)}
                    className="p-2 hover:bg-stone-900 rounded-xl transition text-2xl"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => toggleSpiritualHymn((playing) => setAudioHymnPlaying(playing))}
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-bold transition hidden lg:flex ${
              audioHymnPlaying
                ? 'bg-amber-950 border-amber-500 text-amber-200 animate-pulse'
                : 'bg-stone-900 border-stone-800 text-stone-300 hover:text-amber-200'
            }`}
          >
            <Volume2 className="w-4 h-4 text-amber-400" />
            <span>{audioHymnPlaying ? 'የበገና ዜማ በርቷል' : 'የበገና ዜማ'}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTabPanel((prev) => (prev === 'chat' ? 'none' : 'chat'))}
            className={`p-2.5 rounded-xl border transition ${
              activeTabPanel === 'chat'
                ? 'bg-amber-900/80 text-amber-200 border-amber-500 font-bold'
                : 'bg-stone-900 text-stone-300 border-stone-700'
            }`}
            title="የቀጥታ ቻት"
          >
            <MessageSquare className="w-4 h-4" />
          </button>

          <button
            onClick={() => setActiveTabPanel((prev) => (prev === 'participants' ? 'none' : 'participants'))}
            className={`p-2.5 rounded-xl border transition ${
              activeTabPanel === 'participants'
                ? 'bg-amber-900/80 text-amber-200 border-amber-500 font-bold'
                : 'bg-stone-900 text-stone-300 border-stone-700'
            }`}
            title="ተሳታፊዎች"
          >
            <Users className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              if (onLeaveMeeting) onLeaveMeeting();
              else window.location.reload();
            }}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-red-950/80 hover:bg-red-900 border border-red-700/70 text-red-200 text-xs font-extrabold transition shadow"
          >
            <PhoneOff className="w-4 h-4 text-red-300" />
            <span className="hidden sm:inline">ውጣ</span>
          </button>
        </div>
      </div>
    </div>
  );
};

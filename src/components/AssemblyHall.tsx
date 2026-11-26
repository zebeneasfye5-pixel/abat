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
import { WsMediaAudioPlayer, WsMediaSender } from '../utils/wsMediaRelay';
import { onAuthStateChanged } from 'firebase/auth';
import {
  auth,
  sendAbatRoomMessage,
  subscribeAbatRoomMessages,
  syncAbatRoomMetadata,
} from '../firebase';

interface AssemblyHallProps {
  user: UserProfile;
  onLeaveMeeting?: () => void;
}

type VideoQualityPreset = '1080p' | '720p' | '360p';

const QUALITY_MAP: Record<VideoQualityPreset, { width: number; height: number; maxBitrate: number; label: string }> = {
  '1080p': { width: 1280, height: 720, maxBitrate: 900_000, label: 'HD 720p' },
  '720p': { width: 640, height: 360, maxBitrate: 400_000, label: 'መደበኛ 360p' },
  '360p': { width: 426, height: 240, maxBitrate: 200_000, label: 'ፈጣን 240p' },
};

function setSdpFmtpParam(line: string, key: string, value: string): string {
  const re = new RegExp(`([;\\s])${key}=[^;\\r\\n]*`, 'i');
  if (re.test(line)) {
    return line.replace(re, `$1${key}=${value}`);
  }
  return `${line};${key}=${value}`;
}

function preferRobustOpusSdp(sdp?: string): string | undefined {
  if (!sdp) return sdp;
  const lines = sdp.split('\r\n');
  const opusPt = lines
    .map((line) => line.match(/^a=rtpmap:(\d+)\s+opus\/48000/i)?.[1])
    .find(Boolean);
  if (!opusPt) return sdp;

  const fmtpPrefix = `a=fmtp:${opusPt} `;
  let replaced = false;
  const nextLines = lines.map((line) => {
    if (line.startsWith(fmtpPrefix)) {
      replaced = true;
      let next = setSdpFmtpParam(line, 'useinbandfec', '1');
      next = setSdpFmtpParam(next, 'usedtx', '1');
      next = setSdpFmtpParam(next, 'maxaveragebitrate', '24000');
      return next;
    }
    return line;
  });
  if (!replaced) {
    const idx = nextLines.findIndex((l) => l.startsWith(`a=rtpmap:${opusPt} `));
    if (idx !== -1) {
      nextLines.splice(idx + 1, 0, `${fmtpPrefix}minptime=10;useinbandfec=1;usedtx=1;maxaveragebitrate=24000`);
    }
  }
  return nextLines.join('\r\n');
}

interface RemotePeer {
  peerId: string;
  userName: string;
  baptismalName: string;
  role: string;
  stream: MediaStream | null;
  relayFrame?: string | null;
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

async function applySenderPriority(sender: RTCRtpSender | undefined, kind: 'audio' | 'video', quality: VideoQualityPreset) {
  if (!sender) return;
  const targetBitrate = QUALITY_MAP[quality].maxBitrate;
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    if (kind === 'video') {
      params.encodings.forEach((enc, idx) => {
        if (idx === params.encodings.length - 1) {
          enc.maxBitrate = targetBitrate;
        } else {
          enc.maxBitrate = Math.min(enc.maxBitrate || targetBitrate, targetBitrate);
        }
        enc.maxFramerate = quality === '360p' ? 18 : 24;
        (enc as any).priority = 'low';
        (enc as any).networkPriority = 'low';
      });
      (params as any).degradationPreference = 'balanced';
    } else {
      params.encodings[0].maxBitrate = 24_000;
      (params.encodings[0] as any).priority = 'high';
      (params.encodings[0] as any).networkPriority = 'high';
    }
    await sender.setParameters(params);
  } catch {
    // Browser may skip unsupported RTCRtpEncodingParameters gracefully
  }
}

async function applyStudioEncoderTuning(pc: RTCPeerConnection, quality: VideoQualityPreset) {
  for (const sender of pc.getSenders()) {
    if (!sender.track) continue;
    await applySenderPriority(sender, sender.track.kind === 'audio' ? 'audio' : 'video', quality);
  }
}

interface PipCornerData {
  label: string;
  stream: MediaStream | null;
  relayFrame?: string | null;
  isVideoOn?: boolean;
  isMicOn?: boolean;
  mirror?: boolean;
  onClick?: () => void;
}

const PipCornerTile: React.FC<PipCornerData> = ({
  label,
  stream,
  relayFrame,
  isVideoOn = true,
  isMicOn = true,
  mirror = false,
  onClick,
}) => {
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const [hasFrames, setHasFrames] = useState(false);

  useEffect(() => {
    const el = pipVideoRef.current;
    if (!el || !stream) {
      setHasFrames(false);
      return;
    }
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    el.defaultMuted = true;
    el.muted = true;
    el.play().catch(() => {});
    const check = () => setHasFrames(Boolean(el.videoWidth > 0 && el.videoHeight > 0));
    check();
    const timer = window.setInterval(check, 500);
    return () => clearInterval(timer);
  }, [stream]);

  const showStream = Boolean(
    stream &&
      (hasFrames ||
        (isVideoOn !== false && stream.getVideoTracks().some((t) => t.readyState === 'live' && !t.muted)))
  );
  const showRelay = Boolean(!showStream && relayFrame);

  return (
    <div
      onClick={(e) => {
        if (onClick) {
          e.stopPropagation();
          onClick();
        }
      }}
      className={`absolute bottom-14 right-3 z-30 w-28 sm:w-40 h-36 sm:h-48 rounded-2xl border-2 border-amber-400/90 bg-stone-950 shadow-2xl overflow-hidden flex flex-col justify-end ${
        onClick ? 'cursor-pointer hover:border-amber-300 transition' : 'pointer-events-none'
      }`}
    >
      <video
        ref={pipVideoRef}
        autoPlay
        playsInline
        muted
        onLoadedMetadata={() => {
          pipVideoRef.current?.play().catch(() => {});
          setHasFrames(Boolean(pipVideoRef.current && pipVideoRef.current.videoWidth > 0));
        }}
        onPlaying={() => setHasFrames(Boolean(pipVideoRef.current && pipVideoRef.current.videoWidth > 0))}
        className={`absolute inset-0 w-full h-full object-cover contrast-[1.03] saturate-[1.05] ${
          mirror ? 'mirror' : ''
        } ${showStream ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />
      {showRelay && relayFrame && (
        <img
          src={relayFrame}
          alt={label}
          className="absolute inset-0 w-full h-full object-cover contrast-[1.03] saturate-[1.05]"
        />
      )}
      {!showStream && !showRelay && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-900 text-amber-200 p-2">
          <div className="w-10 h-10 rounded-full bg-amber-950 border border-amber-500/60 flex items-center justify-center text-sm font-extrabold">
            {(label || 'ተ').charAt(0)}
          </div>
        </div>
      )}
      <div className="relative z-10 px-2 py-1 bg-gradient-to-t from-black/95 via-black/75 to-transparent flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isMicOn ? 'bg-emerald-400' : 'bg-red-400'}`} />
        <span className="text-[10px] font-extrabold text-amber-100 truncate">{label}</span>
      </div>
    </div>
  );
};

// Sub-component for reliable high-res remote video/audio attachment + per-video fullscreen
const RemoteVideoTile: React.FC<{
  peer: RemotePeer;
  isGlobalAudioMuted: boolean;
  isPinned: boolean;
  isExpanded: boolean;
  onPin: (peerId: string) => void;
  onToggleExpand: (peerId: string) => void;
  onUnlockAudio?: () => void;
  onVideoHealthChange?: (peerId: string, hasDecodedFrames: boolean) => void;
  tallStage?: boolean;
  pipCorner?: PipCornerData | null;
}> = ({
  peer,
  isGlobalAudioMuted,
  isPinned,
  isExpanded,
  onPin,
  onToggleExpand,
  onUnlockAudio,
  onVideoHealthChange,
  tallStage,
  pipCorner,
}) => {
  const tileRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [needsAudioTap, setNeedsAudioTap] = useState(false);
  const [hasDecodedVideo, setHasDecodedVideo] = useState(false);
  const [hasLiveVideoTrack, setHasLiveVideoTrack] = useState(false);
  const [hasLiveAudioTrack, setHasLiveAudioTrack] = useState(false);

  const checkVideoFrames = useCallback(() => {
    const vid = videoRef.current;
    const ready = Boolean(vid && vid.videoWidth > 0 && vid.videoHeight > 0);
    setHasDecodedVideo((prev) => {
      if (prev !== ready) {
        onVideoHealthChange?.(peer.peerId, ready);
      }
      return ready;
    });
  }, [onVideoHealthChange, peer.peerId]);

  useEffect(() => {
    const stream = peer.stream;
    const videoEl = videoRef.current;
    const audioEl = audioRef.current;

    if (!stream) {
      setHasDecodedVideo(false);
      setHasLiveVideoTrack(false);
      setHasLiveAudioTrack(false);
      onVideoHealthChange?.(peer.peerId, false);
      return;
    }

    const updateTrackStatus = () => {
      setHasLiveVideoTrack(stream.getVideoTracks().some((t) => t.readyState === 'live' && !t.muted));
      setHasLiveAudioTrack(stream.getAudioTracks().some((t) => t.readyState === 'live' && !t.muted));
    };
    updateTrackStatus();

    const tracks = stream.getTracks();
    tracks.forEach((t) => {
      t.addEventListener('unmute', updateTrackStatus);
      t.addEventListener('mute', updateTrackStatus);
      t.addEventListener('ended', updateTrackStatus);
    });

    if (videoEl) {
      if (videoEl.srcObject !== stream) {
        videoEl.srcObject = stream;
      }
      videoEl.defaultMuted = true;
      videoEl.muted = true;
      videoEl.play().catch(() => {});
    }
    if (audioEl) {
      if (audioEl.srcObject !== stream) {
        audioEl.srcObject = stream;
      }
      audioEl.muted = isGlobalAudioMuted;
      if (!isGlobalAudioMuted && stream.getAudioTracks().length > 0) {
        audioEl
          .play()
          .then(() => setNeedsAudioTap(false))
          .catch(() => setNeedsAudioTap(true));
      } else {
        setNeedsAudioTap(false);
      }
    }

    checkVideoFrames();
    const healthPoll = window.setInterval(() => {
      updateTrackStatus();
      checkVideoFrames();
      if (videoEl && videoEl.paused && stream.getVideoTracks().length > 0) {
        videoEl.play().catch(() => {});
      }
      if (audioEl) {
        audioEl.muted = isGlobalAudioMuted;
        if (!isGlobalAudioMuted && audioEl.paused && stream.getAudioTracks().length > 0) {
          audioEl.play().then(() => setNeedsAudioTap(false)).catch(() => {});
        }
      }
    }, 600);

    return () => {
      clearInterval(healthPoll);
      tracks.forEach((t) => {
        t.removeEventListener('unmute', updateTrackStatus);
        t.removeEventListener('mute', updateTrackStatus);
        t.removeEventListener('ended', updateTrackStatus);
      });
    };
  }, [peer.stream, peer.peerId, isGlobalAudioMuted, checkVideoFrames, onVideoHealthChange]);

  const isWebRtcConnected = peer.connectionState === 'connected' || peer.connectionState === 'completed';
  // Never hide actual decoded WebRTC video pixels behind a stale boolean flag!
  const hasWebRtcVideo = Boolean(
    peer.stream && (hasDecodedVideo || (hasLiveVideoTrack && peer.isVideoOn !== false))
  );
  const hasRelayVideo = Boolean(!hasWebRtcVideo && peer.relayFrame);
  const showVisualFeed = hasWebRtcVideo || hasRelayVideo;
  const effectiveMicOn = peer.isMicOn || hasLiveAudioTrack;

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

  const isConnected = isWebRtcConnected || Boolean(peer.relayFrame);

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
        effectiveMicOn && isConnected
          ? 'border-emerald-500 ring-2 ring-emerald-500/40'
          : peer.isHandRaised
          ? 'border-amber-400 ring-2 ring-amber-400/40'
          : 'border-stone-800'
      }`}
    >
      {/* Dedicated audio element so audio plays even when camera is off or hidden on mobile browsers */}
      <audio ref={audioRef} autoPlay playsInline muted={isGlobalAudioMuted} />

      {/* Live WebRTC Video (never display:none, uses opacity-0 so stream never freezes) */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onLoadedMetadata={() => {
          videoRef.current?.play().catch(() => {});
          checkVideoFrames();
        }}
        onLoadedData={checkVideoFrames}
        onPlaying={checkVideoFrames}
        onResize={checkVideoFrames}
        className={`absolute inset-0 w-full h-full object-cover contrast-[1.03] saturate-[1.06] transition-opacity ${
          hasWebRtcVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Automatic 4G/CGNAT WebSocket Relay Video Fallback */}
      {hasRelayVideo && peer.relayFrame && (
        <img
          src={peer.relayFrame}
          alt={peer.baptismalName || peer.userName}
          className="absolute inset-0 w-full h-full object-cover contrast-[1.03] saturate-[1.06]"
        />
      )}

      {!showVisualFeed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-900/95 text-stone-300 p-4 text-center">
          <div className="w-16 h-16 rounded-full bg-amber-950 border-2 border-amber-500/60 flex items-center justify-center text-xl font-extrabold text-amber-200 mb-2">
            {(peer.baptismalName || peer.userName || 'ተ').charAt(0)}
          </div>
          <p className="text-sm font-extrabold text-amber-200">{peer.baptismalName || peer.userName}</p>
          <p className="text-xs text-stone-300 mt-1 max-w-xs leading-relaxed">
            {!peer.stream && !peer.relayFrame
              ? 'ቪዲዮና ድምፅ በመገናኘት ላይ...'
              : peer.isVideoOn === false
              ? effectiveMicOn
                ? 'ካሜራ ዘግተዋል (ድምፅ ክፍት ነው) — ምስል እንዲታይ በእሳቸው ስልክ የካሜራ ቁልፍ (📹) መከፈት አለበት'
                : 'በእሳቸው ስልክ ካሜራና ማይክ ተዘግቷል — እሳቸው ጋር «ካሜራና ማይክ ፍቀድ / ክፈት» መነካት አለበት'
              : 'የቪዲዮ ምስል ከሌላኛው ስልክ እየተቀበለ ነው...'}
          </p>
        </div>
      )}

      {needsAudioTap && peer.stream && !isGlobalAudioMuted && (
        <button
          onClick={() => {
            onUnlockAudio?.();
            videoRef.current?.play().catch(() => {});
            audioRef.current?.play().then(() => setNeedsAudioTap(false)).catch(() => {});
          }}
          className="absolute top-14 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-300 shadow-2xl flex items-center text-white text-xs font-extrabold gap-2 animate-pulse"
        >
          <Volume2 className="w-4 h-4" />
          <span>ድምፅ ለመስማት ይንኩ (Unmute)</span>
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
              effectiveMicOn
                ? 'bg-emerald-950/90 border-emerald-500 text-emerald-300'
                : 'bg-red-950/90 border-red-700 text-red-300'
            }`}
          >
            {effectiveMicOn ? <Mic className="w-3.5 h-3.5 animate-pulse" /> : <MicOff className="w-3.5 h-3.5" />}
          </span>
          <span className="text-stone-200 font-bold">
            {peer.isScreenSharing ? 'ስክሪን እያጋሩ ነው' : effectiveMicOn ? 'እየተናገሩ ነው' : 'ማይክ ዝግ ነው'}
          </span>
        </div>

        <span
          className={`px-2 py-0.5 rounded font-mono text-[11px] font-bold ${
            isConnected
              ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-700/60'
              : 'bg-amber-950/90 text-amber-300 border border-amber-700/60'
          }`}
        >
          {hasWebRtcVideo ? 'ቀጥታ HD' : peer.relayFrame ? 'ቀጥታ 4G Relay' : isWebRtcConnected ? 'ቀጥታ ድምፅ' : peer.connectionState}
        </span>
      </div>

      {/* Picture-in-Picture corner person when zoomed/expanded or in speaker stage */}
      {pipCorner && <PipCornerTile {...pipCorner} />}
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
  const [videoQuality, setVideoQuality] = useState<VideoQualityPreset>('360p');

  // Scalability & SFU Telemetry state
  const [broadcastMode, setBroadcastMode] = useState<'interactive-mesh' | 'stage-broadcast' | 'livekit-sfu'>('interactive-mesh');
  const [liveKitActive, setLiveKitActive] = useState(false);
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
  const [requestingMedia, setRequestingMedia] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsDiagnostic, setWsDiagnostic] = useState<string | null>(null);
  const [wsRelayActive, setWsRelayActive] = useState(false);
  const [videoRelayForced, setVideoRelayForced] = useState(false);
  const [audioRelayForced, setAudioRelayForced] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [wsReconnectNonce, setWsReconnectNonce] = useState(0);

  // Real Connected Remote Peers
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [pinnedPeerId, setPinnedPeerId] = useState<string | null>(null);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newChatText, setNewChatText] = useState('');
  const [showReactionsMenu, setShowReactionsMenu] = useState(false);

  // Refs — unique per browser tab/connection so two devices on same account NEVER collide!
  const selfPeerIdRef = useRef<string>(
    `${user.id || 'peer'}-${Math.random().toString(36).slice(2, 7)}`
  );
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
  const remoteStreamsMapRef = useRef<Map<string, MediaStream>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const webrtcVideoHealthRef = useRef<Map<string, boolean>>(new Map());
  const webrtcAudioFlowingRef = useRef<Map<string, boolean>>(new Map());
  const inboundAudioBytesRef = useRef<Map<string, { bytes: number; stalledChecks: number }>>(new Map());
  const wsAudioPlayerRef = useRef<WsMediaAudioPlayer | null>(null);
  const wsMediaSenderRef = useRef<WsMediaSender | null>(null);
  const rtcConfigRef = useRef<RTCConfiguration>({
    iceCandidatePoolSize: 4,
    iceServers: [
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ],
  });
  const isMicOnRef = useRef(isMicOn);
  isMicOnRef.current = isMicOn;
  const isVideoOnRef = useRef(isVideoOn || isScreenSharing);
  isVideoOnRef.current = isVideoOn || isScreenSharing;
  const isHandRaisedRef = useRef(isHandRaised);
  isHandRaisedRef.current = isHandRaised;
  const isScreenSharingRef = useRef(isScreenSharing);
  isScreenSharingRef.current = isScreenSharing;
  const wsRelayActiveRef = useRef(wsRelayActive);
  wsRelayActiveRef.current = wsRelayActive;
  const videoRelayForcedRef = useRef(videoRelayForced);
  videoRelayForcedRef.current = videoRelayForced;
  const audioRelayForcedRef = useRef(audioRelayForced);
  audioRelayForcedRef.current = audioRelayForced;
  const isGlobalAudioMutedRef = useRef(isGlobalAudioMuted);
  isGlobalAudioMutedRef.current = isGlobalAudioMuted;
  const remotePeersRef = useRef<RemotePeer[]>(remotePeers);
  remotePeersRef.current = remotePeers;
  const videoQualityRef = useRef<VideoQualityPreset>(videoQuality);
  videoQualityRef.current = videoQuality;
  const liveKitActiveRef = useRef(liveKitActive);
  liveKitActiveRef.current = liveKitActive;

  const meetingContainerRef = useRef<HTMLDivElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const handlePeerVideoHealthChange = useCallback((peerId: string, hasDecodedFrames: boolean) => {
    webrtcVideoHealthRef.current.set(peerId, hasDecodedFrames);
  }, []);

  const unlockRemoteAudio = useCallback(() => {
    wsAudioPlayerRef.current?.unlock().then((ok) => {
      if (ok) setAudioBlocked(false);
    });
    wsMediaSenderRef.current?.resumeAudio();
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
    if (typeof document !== 'undefined') {
      document.querySelectorAll('audio').forEach((el) => {
        if (!isGlobalAudioMutedRef.current && el.srcObject) {
          el.muted = false;
          el.play().catch(() => {});
        }
      });
    }
  }, []);

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
    if (existing && existing.signalingState !== 'closed') {
      return existing;
    }

    const pc = new RTCPeerConnection(rtcConfigRef.current);
    peerConnectionsRef.current.set(targetPeerId, pc);

    const localStream = screenStreamRef.current || localStreamRef.current;
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
    } else {
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }

    pc.onicecandidate = (event) => {
      if (liveKitRoomRef.current) return;
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

    const syncStreamState = (track?: MediaStreamTrack, forceUnmutedVisual = false) => {
      let peerStream = remoteStreamsMapRef.current.get(targetPeerId);
      if (!peerStream) {
        peerStream = new MediaStream();
        remoteStreamsMapRef.current.set(targetPeerId, peerStream);
      }
      if (track) {
        peerStream.getTracks().forEach((t) => {
          if (t.kind === track.kind && t.id !== track.id) {
            peerStream!.removeTrack(t);
          }
        });
        if (!peerStream.getTracks().some((t) => t.id === track.id)) {
          peerStream.addTrack(track);
        }
      }
      const wrapped = new MediaStream(peerStream.getTracks());
      const hasLiveVid = wrapped.getVideoTracks().some((t) => t.readyState === 'live' && !t.muted);
      const hasLiveAud = wrapped.getAudioTracks().some((t) => t.readyState === 'live' && !t.muted);
      setRemotePeers((prev) => {
        const exists = prev.some((p) => p.peerId === targetPeerId);
        if (!exists) {
          return [
            ...prev,
            {
              peerId: targetPeerId,
              userName: 'ተሳታፊ',
              baptismalName: 'ተሳታፊ',
              role: 'child',
              stream: wrapped,
              connectionState: pc.iceConnectionState || 'connecting',
              isMicOn: hasLiveAud || wrapped.getAudioTracks().length > 0,
              isVideoOn: hasLiveVid || wrapped.getVideoTracks().length > 0,
              isHandRaised: false,
              isScreenSharing: false,
              onStage: true,
            },
          ];
        }
        return prev.map((p) =>
          p.peerId === targetPeerId
            ? {
                ...p,
                stream: wrapped,
                isVideoOn: forceUnmutedVisual && track?.kind === 'video' ? true : p.isVideoOn || hasLiveVid,
                isMicOn: forceUnmutedVisual && track?.kind === 'audio' ? true : p.isMicOn || hasLiveAud,
              }
            : p
        );
      });
    };

    pc.ontrack = (event) => {
      syncStreamState(event.track, !event.track.muted);
      event.track.onunmute = () => syncStreamState(event.track, true);
    };

    const handleConnState = () => {
      if (liveKitRoomRef.current) return;
      const state = pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed'
        ? pc.iceConnectionState
        : pc.connectionState || pc.iceConnectionState;
      setRemotePeers((prev) =>
        prev.map((p) => (p.peerId === targetPeerId ? { ...p, connectionState: state } : p))
      );
      if (state === 'connected' || state === 'completed') {
        applyStudioEncoderTuning(pc, videoQualityRef.current);
      } else if (pc.iceConnectionState === 'failed' || pc.connectionState === 'failed') {
        try {
          pc.restartIce();
        } catch {}
        setWsRelayActive(true);
      }
    };

    pc.oniceconnectionstatechange = handleConnState;
    pc.onconnectionstatechange = handleConnState;

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

    const acquireInitialMedia = async (): Promise<MediaStream | null> => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setIsVideoOn(false);
        setIsMicOn(false);
        setMediaWarning('ካሜራ ለመክፈት HTTPS ደህንነቱ የተጠበቀ ግንኙነት ያስፈልጋል።');
        return null;
      }

      const hdAudioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 48000,
      };

      const initialSpec = QUALITY_MAP[videoQualityRef.current];
      const attempts: Array<{ constraints: MediaStreamConstraints; label: string }> = [
        {
          label: initialSpec.label,
          constraints: {
            video: {
              facingMode: 'user',
              width: { ideal: initialSpec.width, min: 240 },
              height: { ideal: initialSpec.height, min: 180 },
              frameRate: { ideal: videoQualityRef.current === '360p' ? 18 : 24, max: 24 },
            },
            audio: hdAudioConstraints,
          },
        },
        {
          label: 'standard-cam-mic',
          constraints: { video: { facingMode: 'user' }, audio: true },
        },
        {
          label: 'any-cam-mic',
          constraints: { video: true, audio: true },
        },
        {
          label: 'video-only',
          constraints: { video: true },
        },
        {
          label: 'audio-only',
          constraints: { audio: true },
        },
      ];

      let lastErrName = '';
      for (const attempt of attempts) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia(attempt.constraints);
          const hasVideo = stream.getVideoTracks().length > 0;
          const hasAudio = stream.getAudioTracks().length > 0;
          isVideoOnRef.current = hasVideo;
          isMicOnRef.current = hasAudio;
          setIsVideoOn(hasVideo);
          setIsMicOn(hasAudio);
          if (!hasVideo) {
            setMediaWarning('ካሜራ አልተገኘም ወይም ፍቃድ ይፈልጋል፤ «ካሜራና ማይክ ፍቀድ / ክፈት» የሚለውን ይጫኑ።');
          } else {
            setMediaWarning(null);
          }
          return stream;
        } catch (err: any) {
          lastErrName = err?.name || '';
        }
      }

      isVideoOnRef.current = false;
      isMicOnRef.current = false;
      setIsVideoOn(false);
      setIsMicOn(false);
      if (lastErrName === 'NotAllowedError' || lastErrName === 'PermissionDeniedError') {
        setMediaWarning('የስልክዎ/ብራውዘርዎ ካሜራ ፍቃድ ተዘግቷል፤ ከላይ ያለውን «ካሜራና ማይክ ፍቀድ / ክፈት» ይንኩ ወይም በብራውዘር አድራሻ አሞሌ 🔒 ላይ Camera → Allow ያድርጉ።');
      } else {
        setMediaWarning('ካሜራ ለማብራት «ካሜራና ማይክ ፍቀድ / ክፈት» የሚለውን ይጫኑ።');
      }
      return null;
    };

    const boot = async () => {
      const extConfig = await fetchWebRTCConfig();
      rtcConfigRef.current = {
        iceServers: extConfig.iceServers,
        iceCandidatePoolSize: 4,
      };

      // 1. Acquire Video & Audio with universal fallbacks
      const acquiredStream = await acquireInitialMedia();

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
        if (acquiredStream.getAudioTracks().length > 0) {
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
            const { Room, RoomEvent, Track, ConnectionState } = await import('livekit-client');
            const initialSpec = QUALITY_MAP[videoQualityRef.current];
            const lkRoom = new Room({
              adaptiveStream: true,
              dynacast: true,
              publishDefaults: {
                simulcast: true,
                dtx: true,
                red: true,
                audioPreset: { maxBitrate: 24_000 },
                videoEncoding: {
                  maxBitrate: initialSpec.maxBitrate,
                  maxFramerate: videoQualityRef.current === '360p' ? 18 : 24,
                },
                degradationPreference: 'maintain-framerate',
              },
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
              .on(RoomEvent.TrackSubscribed, () => {
                syncLkParticipants();
                unlockRemoteAudio();
              })
              .on(RoomEvent.TrackUnsubscribed, syncLkParticipants)
              .on(RoomEvent.TrackMuted, syncLkParticipants)
              .on(RoomEvent.TrackUnmuted, syncLkParticipants)
              .on(RoomEvent.LocalTrackPublished, (pub) => {
                if (pub.track?.sender) {
                  applySenderPriority(
                    pub.track.sender,
                    pub.track.kind === Track.Kind.Audio ? 'audio' : 'video',
                    videoQualityRef.current
                  );
                }
              })
              .on(RoomEvent.ConnectionStateChanged, (state) => {
                const connected = state === ConnectionState.Connected;
                setLiveKitActive(connected);
                if (connected) {
                  wsMediaSenderRef.current?.stop();
                  wsMediaSenderRef.current = null;
                  setWsRelayActive(false);
                  setVideoRelayForced(false);
                  setAudioRelayForced(false);
                }
              })
              .on(RoomEvent.Disconnected, () => {
                setLiveKitActive(false);
              });

            await lkRoom.connect(lkData.url, lkData.token);
            setLiveKitActive(true);
            setBroadcastMode('livekit-sfu');
            wsMediaSenderRef.current?.stop();
            wsMediaSenderRef.current = null;
            setWsRelayActive(false);
            setVideoRelayForced(false);
            setAudioRelayForced(false);
            peerConnectionsRef.current.forEach((pc) => pc.close());
            peerConnectionsRef.current.clear();

            if (acquiredStream) {
              const qSpec = QUALITY_MAP[videoQualityRef.current];
              for (const t of acquiredStream.getTracks()) {
                if (t.kind === 'audio') {
                  const pub = await lkRoom.localParticipant.publishTrack(t, {
                    source: Track.Source.Microphone,
                    dtx: true,
                    red: true,
                    audioPreset: { maxBitrate: 24_000 },
                  });
                  if (pub?.track?.sender) {
                    applySenderPriority(pub.track.sender, 'audio', videoQualityRef.current);
                  }
                } else if (t.kind === 'video') {
                  const pub = await lkRoom.localParticipant.publishTrack(t, {
                    source: Track.Source.Camera,
                    simulcast: true,
                    videoEncoding: {
                      maxBitrate: qSpec.maxBitrate,
                      maxFramerate: videoQualityRef.current === '360p' ? 18 : 24,
                    },
                    degradationPreference: 'maintain-framerate',
                  });
                  if (pub?.track?.sender) {
                    applySenderPriority(pub.track.sender, 'video', videoQualityRef.current);
                  }
                }
              }
            }
            syncLkParticipants();
          }
        } catch (err) {
          if (liveKitRoomRef.current) {
            try {
              liveKitRoomRef.current.disconnect();
            } catch {}
            liveKitRoomRef.current = null;
          }
          setLiveKitActive(false);
          console.warn('LiveKit SFU fallback to built-in Relay/Stage WS:', err);
        }
      }

      // 3. Connect High-Scale Anti-Congestion WebSocket Signaling with Auto-Reconnect & 15s Keepalive
      if (!wsAudioPlayerRef.current) {
        wsAudioPlayerRef.current = new WsMediaAudioPlayer((blocked) => setAudioBlocked(blocked));
      }

      let reconnectTimer: number | null = null;
      let keepaliveTimer: number | null = null;
      let diagTimer: number | null = null;

      const connectWebSocket = () => {
        if (isCancelled) return;
        const ws = new WebSocket(getRealtimeWsUrl());
        wsRef.current = ws;

        if (diagTimer) clearTimeout(diagTimer);
        diagTimer = window.setTimeout(() => {
          if (!isCancelled && ws.readyState !== WebSocket.OPEN) {
            const onVercelNoBackend =
              typeof window !== 'undefined' &&
              window.location.hostname.includes('vercel.app') &&
              !(import.meta.env.VITE_API_URL || '').trim();
            setWsDiagnostic(
              onVercelNoBackend
                ? 'ይህ የVercel ገፅ ከቪዲዮ ሰርቨር ጋር አልተገናኘም! በቀጥታ የRender ሊንክዎን (.onrender.com) ይክፈቱ።'
                : 'ከቪዲዮ ሰርቨሩ ጋር ግንኙነት እየተሞከረ ነው... የኢንተርኔት ግንኙነትዎን ያረጋግጡ።'
            );
          }
        }, 4000);

        ws.onopen = () => {
          if (isCancelled) {
            ws.close();
            return;
          }
          if (diagTimer) clearTimeout(diagTimer);
          setWsConnected(true);
          setWsDiagnostic(null);

          const activeStream = screenStreamRef.current || localStreamRef.current;
          ws.send(
            JSON.stringify({
              type: 'join-room',
              roomId: ROOM_ID,
              userId: selfPeerIdRef.current,
              userName: user.fullName,
              baptismalName: user.baptismalName || user.fullName,
              role: user.role,
              isMicOn: isMicOnRef.current && Boolean(activeStream?.getAudioTracks().length),
              isVideoOn: Boolean(activeStream?.getVideoTracks().length),
            })
          );

          if (keepaliveTimer) clearInterval(keepaliveTimer);
          keepaliveTimer = window.setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ws-ping' }));
            }
          }, 15000);
        };

        ws.onclose = () => {
          setWsConnected(false);
          if (keepaliveTimer) clearInterval(keepaliveTimer);
          if (!isCancelled) {
            reconnectTimer = window.setTimeout(connectWebSocket, 2500);
          }
        };

        ws.onerror = () => {
          // onclose will trigger auto-reconnect
        };

        ws.onmessage = async (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'ws-pong') {
              return;
            } else if (data.type === 'request-video-relay') {
              if (liveKitRoomRef.current || !data.senderPeerId || data.senderPeerId === selfPeerIdRef.current) return;
              setVideoRelayForced(true);
              return;
            } else if (data.type === 'request-audio-relay') {
              if (liveKitRoomRef.current || !data.senderPeerId || data.senderPeerId === selfPeerIdRef.current) return;
              setAudioRelayForced(true);
              return;
            } else if (data.type === 'ws-video-frame') {
              if (liveKitRoomRef.current || !data.senderPeerId || data.senderPeerId === selfPeerIdRef.current) return;
              setRemotePeers((prev) =>
                prev.map((p) =>
                  p.peerId === data.senderPeerId
                    ? { ...p, relayFrame: data.frame, isVideoOn: data.isVideoOn !== false }
                    : p
                )
              );
              return;
            } else if (data.type === 'ws-audio-chunk') {
              if (liveKitRoomRef.current || !data.senderPeerId || data.senderPeerId === selfPeerIdRef.current) return;
              const senderPeer = remotePeersRef.current.find((p) => p.peerId === data.senderPeerId);
              const audioBytesFlowing = webrtcAudioFlowingRef.current.get(data.senderPeerId) === true;
              const hasLiveUnmutedTrack = Boolean(
                senderPeer?.stream?.getAudioTracks().some((t) => t.readyState === 'live' && !t.muted)
              );
              const hasVerifiedWebRtcAudio =
                senderPeer &&
                (senderPeer.connectionState === 'connected' || senderPeer.connectionState === 'completed') &&
                audioBytesFlowing &&
                hasLiveUnmutedTrack;
              if (!hasVerifiedWebRtcAudio) {
                wsAudioPlayerRef.current?.playChunk(
                  data.senderPeerId,
                  data.pcm16,
                  data.sr || 16000,
                  isGlobalAudioMutedRef.current
                );
              }
              return;
            }

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

              // Close any stale peer connections before creating fresh ones for reconnected room-state
              peerConnectionsRef.current.forEach((pc) => pc.close());
              peerConnectionsRef.current.clear();
              remoteStreamsMapRef.current.clear();
              pendingIceRef.current.clear();
              webrtcAudioFlowingRef.current.clear();
              inboundAudioBytesRef.current.clear();

              const existing: any[] = data.existingPeers || [];
              setRemotePeers(
                existing.map((p) => ({
                  peerId: p.peerId,
                  userName: p.userName,
                  baptismalName: p.baptismalName || p.userName,
                  role: p.role,
                  stream: null,
                  relayFrame: null,
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
                const tunedSdp = preferRobustOpusSdp(offer.sdp);
                const tunedOffer = tunedSdp ? { type: offer.type, sdp: tunedSdp } : offer;
                await pc.setLocalDescription(tunedOffer);
                ws.send(
                  JSON.stringify({
                    type: 'webrtc-signal',
                    roomId: ROOM_ID,
                    targetPeerId: p.peerId,
                    signal: { sdp: tunedOffer },
                  })
                );
              }
            } else if (data.type === 'peer-joined' && data.peer) {
              if (typeof data.clientCount === 'number') setServerClientCount(data.clientCount);
              if (data.broadcastMode && !liveKitRoomRef.current) setBroadcastMode(data.broadcastMode);
              if (liveKitRoomRef.current) return;

              const p = data.peer;
              if (p.peerId === selfPeerIdRef.current) return;

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
                      relayFrame: null,
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
                    relayFrame: null,
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
              if (senderId === selfPeerIdRef.current) return;

              // Guarantee sender tile exists even if signal arrived ahead of peer-joined
              setRemotePeers((prev) => {
                if (prev.some((x) => x.peerId === senderId)) return prev;
                return [
                  ...prev,
                  {
                    peerId: senderId,
                    userName: data.senderName || 'ተሳታፊ',
                    baptismalName: data.senderName || 'ተሳታፊ',
                    role: data.senderRole || 'child',
                    stream: null,
                    relayFrame: null,
                    connectionState: 'connecting',
                    isMicOn: true,
                    isVideoOn: true,
                    isHandRaised: false,
                    isScreenSharing: false,
                    onStage: data.senderOnStage !== false,
                  },
                ];
              });

              const pc = createPeerConnection(senderId);
              const { signal } = data;

              if (signal.sdp) {
                const isOffer = signal.sdp.type === 'offer';
                const polite = selfPeerIdRef.current < senderId;
                const tunedRemoteSdp = preferRobustOpusSdp(signal.sdp.sdp);
                const remoteDesc = tunedRemoteSdp ? { type: signal.sdp.type, sdp: tunedRemoteSdp } : signal.sdp;
                if (isOffer && pc.signalingState !== 'stable') {
                  if (!polite) return;
                  await Promise.all([
                    pc.setLocalDescription({ type: 'rollback' }),
                    pc.setRemoteDescription(new RTCSessionDescription(remoteDesc)),
                  ]);
                } else {
                  await pc.setRemoteDescription(new RTCSessionDescription(remoteDesc));
                }
                await flushIceCandidates(senderId, pc);
                if (isOffer) {
                  const answer = await pc.createAnswer();
                  const tunedAnswerSdp = preferRobustOpusSdp(answer.sdp);
                  const tunedAnswer = tunedAnswerSdp ? { type: answer.type, sdp: tunedAnswerSdp } : answer;
                  await pc.setLocalDescription(tunedAnswer);
                  ws.send(
                    JSON.stringify({
                      type: 'webrtc-signal',
                      roomId: ROOM_ID,
                      targetPeerId: senderId,
                      signal: { sdp: tunedAnswer },
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
                        relayFrame: data.isVideoOn === false ? null : p.relayFrame,
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
                  liveKitRoomRef.current?.localParticipant?.audioTrackPublications?.forEach((pub: any) => {
                    pub.mute?.().catch(() => {});
                  });
                }
              } else {
                setRemotePeers((prev) =>
                  prev.map((p) => (p.peerId === data.peerId ? { ...p, onStage: Boolean(data.onStage) } : p))
                );
              }
            } else if (data.type === 'peer-left') {
              if (typeof data.clientCount === 'number') setServerClientCount(data.clientCount);
              if (liveKitRoomRef.current) return;
              const pc = peerConnectionsRef.current.get(data.peerId);
              if (pc) {
                pc.close();
                peerConnectionsRef.current.delete(data.peerId);
              }
              remoteStreamsMapRef.current.delete(data.peerId);
              pendingIceRef.current.delete(data.peerId);
              webrtcAudioFlowingRef.current.delete(data.peerId);
              inboundAudioBytesRef.current.delete(data.peerId);
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
              liveKitRoomRef.current?.localParticipant?.audioTrackPublications?.forEach((pub: any) => {
                pub.mute?.().catch(() => {});
              });
            }
          } catch (err) {
            console.warn('WS message handle error:', err);
          }
        };
      };

      connectWebSocket();

      return () => {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        if (keepaliveTimer) clearInterval(keepaliveTimer);
        if (diagTimer) clearTimeout(diagTimer);
      };
    };

    let cleanupWsTimers: (() => void) | undefined;
    boot().then((fn) => {
      if (typeof fn === 'function') cleanupWsTimers = fn;
    });

    return () => {
      isCancelled = true;
      cleanupWsTimers?.();
      wsMediaSenderRef.current?.stop();
      wsMediaSenderRef.current = null;
      wsAudioPlayerRef.current?.dispose();
      wsAudioPlayerRef.current = null;
      if (liveKitRoomRef.current) {
        try {
          liveKitRoomRef.current.disconnect();
        } catch {}
        liveKitRoomRef.current = null;
      }
      setLiveKitActive(false);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'leave-room' }));
        wsRef.current.close();
      }
      peerConnectionsRef.current.forEach((pc) => pc.close());
      peerConnectionsRef.current.clear();
      remoteStreamsMapRef.current.clear();
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
  }, [createPeerConnection, triggerReaction, user.id, user.fullName, user.baptismalName, user.role, wsReconnectNonce]);

  // Firestore abat_messages real-time chat sync (complements live WebSocket chat)
  useEffect(() => {
    let unsubMessages: (() => void) | undefined;
    const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
      unsubMessages?.();
      unsubMessages = undefined;
      if (!fbUser || !fbUser.emailVerified) return;

      unsubMessages = subscribeAbatRoomMessages(
        ROOM_ID,
        (fsMessages) => {
          setChatMessages((prev) => {
            const seen = new Set<string>();
            const merged: ChatMessage[] = [];
            for (const m of fsMessages) {
              const key = `${m.senderName}::${m.timeLabel}::${m.text}`;
              seen.add(key);
              merged.push({
                id: m.id,
                sender: m.senderName,
                text: m.text,
                time: m.timeLabel,
                isPriest: m.isPriest,
              });
            }
            for (const p of prev) {
              const key = `${p.sender}::${p.time}::${p.text}`;
              if (!seen.has(key)) {
                seen.add(key);
                merged.push(p);
              }
            }
            return merged;
          });
        },
        (err) => console.warn('abat_messages sync notice:', err.message)
      );
    });
    return () => {
      unsubMessages?.();
      unsubAuth();
    };
  }, [ROOM_ID]);

  // Firestore abat_rooms metadata sync when authenticated via Google
  useEffect(() => {
    if (!auth.currentUser || !auth.currentUser.emailVerified) return;
    syncAbatRoomMetadata({
      roomId: ROOM_ID,
      title: 'የቀጥታ ዙም ጉባኤ (Assembly Hall)',
      roomType: 'assembly',
      status: 'live',
      visibility: 'community',
      qualityPreset: videoQuality === '1080p' ? '1080p' : videoQuality === '720p' ? '720p' : '360p',
      participantCount: Math.max(1, serverClientCount, 1 + remotePeers.length),
      hostName: user.baptismalName || user.fullName || 'ቀሲስ ሄኖክ',
    }).catch((err) => console.warn('abat_rooms sync notice:', err?.message || err));
  }, [ROOM_ID, videoQuality, serverClientCount, remotePeers.length, user.baptismalName, user.fullName]);

  // Sync expanded/fullscreen state when user presses browser Back/ESC
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
        setExpandedTileId(null);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Keep local self-view video bound whenever viewMode switches (gallery <-> speaker)
  useEffect(() => {
    const stream = screenStreamRef.current || localStreamRef.current;
    if (localVideoRef.current && stream) {
      if (localVideoRef.current.srcObject !== stream) {
        localVideoRef.current.srcObject = stream;
      }
      localVideoRef.current.play().catch(() => {});
    }
  }, [viewMode, isVideoOn, isScreenSharing]);

  // Global mobile touch/pointer listener so AudioContext & <audio> unlock on any screen tap
  useEffect(() => {
    const onUserGesture = () => {
      unlockRemoteAudio();
    };
    window.addEventListener('pointerdown', onUserGesture, { passive: true, capture: true });
    window.addEventListener('touchstart', onUserGesture, { passive: true, capture: true });
    return () => {
      window.removeEventListener('pointerdown', onUserGesture, true);
      window.removeEventListener('touchstart', onUserGesture, true);
    };
  }, [unlockRemoteAudio]);

  // Automatic 4.5s CGNAT / Symmetric-4G Relay Detection + Video/Audio RTP Packet Health Fallback
  useEffect(() => {
    const activeStagePeers = remotePeers.filter((p) => p.onStage !== false || p.role === 'priest');
    if (activeStagePeers.length === 0 || liveKitRoomRef.current || liveKitActive) {
      setWsRelayActive(false);
      setVideoRelayForced(false);
      setAudioRelayForced(false);
      return;
    }

    const anyFailed = activeStagePeers.some((p) => p.connectionState === 'failed');
    if (anyFailed) {
      setWsRelayActive(true);
      return;
    }

    const allWebRtcConnected = activeStagePeers.every(
      (p) => p.connectionState === 'connected' || p.connectionState === 'completed'
    );
    if (allWebRtcConnected) {
      setWsRelayActive(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setWsRelayActive(true);
    }, 4500);
    return () => clearTimeout(timer);
  }, [remotePeers, liveKitActive]);

  // Continuous RTP Stats Monitor (every 2.5s):
  // Guarantees bidirectional audio & video relay activate IMMEDIATELY if ICE claims "connected" yet 0 RTP packets flow over 4G CGNAT!
  useEffect(() => {
    const activeStagePeers = remotePeers.filter((p) => p.onStage !== false || p.role === 'priest');
    if (activeStagePeers.length === 0 || !wsConnected || liveKitRoomRef.current || liveKitActive) return;

    const inspectMediaStats = async () => {
      if (liveKitRoomRef.current || liveKitActiveRef.current) return;
      const peersNow = remotePeersRef.current.filter((p) => p.onStage !== false || p.role === 'priest');
      for (const peer of peersNow) {
        const isConn = peer.connectionState === 'connected' || peer.connectionState === 'completed';
        if (!isConn) continue;

        const hasFrames = webrtcVideoHealthRef.current.get(peer.peerId) === true;
        if (!hasFrames && peer.isVideoOn !== false && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'request-video-relay',
              roomId: ROOM_ID,
              targetPeerId: peer.peerId,
            })
          );
        }

        const pc = peerConnectionsRef.current.get(peer.peerId);
        if (!pc) continue;
        try {
          const stats = await pc.getStats();
          let inboundAudioBytes = 0;
          stats.forEach((report) => {
            if (report.type === 'inbound-rtp' && report.kind === 'audio') {
              inboundAudioBytes += Number(report.bytesReceived || 0);
            }
          });

          const prev = inboundAudioBytesRef.current.get(peer.peerId) || { bytes: 0, stalledChecks: 0 };
          if (inboundAudioBytes > prev.bytes) {
            webrtcAudioFlowingRef.current.set(peer.peerId, true);
            inboundAudioBytesRef.current.set(peer.peerId, { bytes: inboundAudioBytes, stalledChecks: 0 });
          } else {
            const nextStalls = prev.stalledChecks + 1;
            inboundAudioBytesRef.current.set(peer.peerId, { bytes: inboundAudioBytes, stalledChecks: nextStalls });
            if (peer.isMicOn && (inboundAudioBytes === 0 || nextStalls >= 2)) {
              webrtcAudioFlowingRef.current.set(peer.peerId, false);
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(
                  JSON.stringify({
                    type: 'request-audio-relay',
                    roomId: ROOM_ID,
                    targetPeerId: peer.peerId,
                  })
                );
              }
            }
          }

          if (isMicOnRef.current) {
            let audioOutboundFound = false;
            let packetsSent = 0;
            stats.forEach((report) => {
              if (report.type === 'outbound-rtp' && report.kind === 'audio') {
                audioOutboundFound = true;
                packetsSent += Number(report.packetsSent || 0);
              }
            });
            if (!audioOutboundFound || packetsSent === 0) {
              setAudioRelayForced(true);
            }
          }

          if (isVideoOnRef.current) {
            let videoOutboundFound = false;
            let framesSent = 0;
            stats.forEach((report) => {
              if (report.type === 'outbound-rtp' && report.kind === 'video') {
                videoOutboundFound = true;
                framesSent += Number(report.framesSent || 0);
              }
            });
            if (!videoOutboundFound || framesSent === 0) {
              setVideoRelayForced(true);
            }
          }
        } catch {}
      }
    };

    const initialTimer = window.setTimeout(inspectMediaStats, 2500);
    const intervalTimer = window.setInterval(inspectMediaStats, 3500);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    };
  }, [remotePeers.length, wsConnected, liveKitActive]);

  // Run WebSocket Media Sender whenever full WS Relay OR Video/Audio Relay Fallback is active (disabled whenever LiveKit is active)
  useEffect(() => {
    const needsSender =
      (wsRelayActive || videoRelayForced || audioRelayForced) &&
      wsConnected &&
      selfOnStage &&
      !liveKitRoomRef.current &&
      !liveKitActive;
    if (!needsSender) {
      wsMediaSenderRef.current?.stop();
      wsMediaSenderRef.current = null;
      return;
    }

    const sender = new WsMediaSender({
      roomId: ROOM_ID,
      getWs: () => wsRef.current,
      getVideoElement: () => localVideoRef.current,
      getLocalStream: () => screenStreamRef.current || localStreamRef.current,
      isVideoEnabled: () => isVideoOnRef.current,
      isMicEnabled: () => isMicOnRef.current,
      shouldSendVideo: () =>
        !liveKitRoomRef.current &&
        !liveKitActiveRef.current &&
        (wsRelayActiveRef.current || videoRelayForcedRef.current) &&
        isVideoOnRef.current,
      shouldSendAudio: () =>
        !liveKitRoomRef.current &&
        !liveKitActiveRef.current &&
        (wsRelayActiveRef.current || audioRelayForcedRef.current) &&
        isMicOnRef.current,
    });
    wsMediaSenderRef.current = sender;
    sender.start();

    return () => {
      sender.stop();
      if (wsMediaSenderRef.current === sender) {
        wsMediaSenderRef.current = null;
      }
    };
  }, [wsRelayActive, videoRelayForced, audioRelayForced, wsConnected, selfOnStage, liveKitActive]);

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
          isMicOn: overrides.isMicOn ?? isMicOnRef.current,
          isVideoOn: overrides.isVideoOn ?? isVideoOnRef.current,
          isHandRaised: overrides.isHandRaised ?? isHandRaisedRef.current,
          isScreenSharing: overrides.isScreenSharing ?? isScreenSharingRef.current,
        })
      );
    }
  };

  const handleChangeQuality = async (nextQuality: VideoQualityPreset) => {
    setVideoQuality(nextQuality);
    const spec = QUALITY_MAP[nextQuality];
    const targetFps = nextQuality === '360p' ? 18 : 24;
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack) {
      try {
        await videoTrack.applyConstraints({
          width: { ideal: spec.width },
          height: { ideal: spec.height },
          frameRate: { ideal: targetFps, max: 24 },
        });
      } catch {}
    }
    if (liveKitRoomRef.current?.localParticipant?.videoTrackPublications) {
      liveKitRoomRef.current.localParticipant.videoTrackPublications.forEach((pub: any) => {
        if (pub.track?.sender) {
          applySenderPriority(pub.track.sender, 'video', nextQuality);
        }
      });
    }
    peerConnectionsRef.current.forEach((pc) => {
      applyStudioEncoderTuning(pc, nextQuality);
    });
  };

  const handleRequestCameraPermission = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaWarning('ብራውዘርዎ ካሜራ አይደግፍም ወይም HTTPS ግንኙነት ያስፈልጋል።');
      return;
    }
    setRequestingMedia(true);
    try {
      const spec = QUALITY_MAP[videoQuality];
      const candidates: MediaStreamConstraints[] = [
        {
          video: {
            facingMode,
            width: { ideal: spec.width, min: 240 },
            height: { ideal: spec.height, min: 180 },
            frameRate: { ideal: videoQuality === '360p' ? 18 : 24, max: 24 },
          },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: 48000 },
        },
        { video: { facingMode }, audio: true },
        { video: true, audio: true },
        { video: true },
      ];

      let stream: MediaStream | null = null;
      let lastErr: any = null;
      for (const c of candidates) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(c);
          break;
        } catch (err) {
          lastErr = err;
        }
      }

      if (!stream) {
        const name = lastErr?.name || '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setMediaWarning('ካሜራው በብራውዘር ቅንብር ተከልክሏል። ከላይ ያለውን 🔒 (Site Settings) ነክተው Camera → Allow ያድርጉና «ካሜራ ፍቀድ» ይጫኑ።');
        } else if (name === 'NotReadableError') {
          setMediaWarning('ካሜራው በሌላ አፕ (ለምሳሌ Zoom/WhatsApp) እየተጠቀመ ነው፤ እሱን ዘግተው እንደገና ይሞክሩ።');
        } else {
          setMediaWarning('ካሜራ መክፈት አልተቻለም። እባክዎ የስልክዎን ካሜራ ፍቃድ ያረጋግጡ።');
        }
        return;
      }

      // Preserve/stop old tracks cleanly and attach new tracks
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      const hasVideo = stream.getVideoTracks().length > 0;
      const hasAudio = stream.getAudioTracks().length > 0;
      isVideoOnRef.current = hasVideo;
      isMicOnRef.current = hasAudio;
      setIsVideoOn(hasVideo);
      setIsMicOn(hasAudio);
      setMediaWarning(null);

      // Push/replace new tracks on LiveKit if connected (without opening P2P/WS relay)
      if (liveKitRoomRef.current) {
        const { Track } = await import('livekit-client');
        for (const t of stream.getTracks()) {
          if (t.kind === 'audio') {
            const existingAudioPub = liveKitRoomRef.current.localParticipant.getTrackPublication(Track.Source.Microphone);
            if (existingAudioPub?.track) {
              await existingAudioPub.track.replaceTrack(t, true).catch(() => {});
            } else {
              const pub = await liveKitRoomRef.current.localParticipant
                .publishTrack(t, {
                  source: Track.Source.Microphone,
                  dtx: true,
                  red: true,
                  audioPreset: { maxBitrate: 24_000 },
                })
                .catch(() => null);
              if (pub?.track?.sender) applySenderPriority(pub.track.sender, 'audio', videoQuality);
            }
          } else if (t.kind === 'video') {
            const existingCamPub = liveKitRoomRef.current.localParticipant.getTrackPublication(Track.Source.Camera);
            if (existingCamPub?.track) {
              await existingCamPub.track.replaceTrack(t, true).catch(() => {});
            } else {
              const pub = await liveKitRoomRef.current.localParticipant
                .publishTrack(t, {
                  source: Track.Source.Camera,
                  simulcast: true,
                  videoEncoding: {
                    maxBitrate: spec.maxBitrate,
                    maxFramerate: videoQuality === '360p' ? 18 : 24,
                  },
                  degradationPreference: 'maintain-framerate',
                })
                .catch(() => null);
              if (pub?.track?.sender) applySenderPriority(pub.track.sender, 'video', videoQuality);
            }
          }
        }
      } else {
        // Push/upgrade transceivers & renegotiate new tracks cleanly across all WebRTC peer connections
        for (const [peerId, pc] of peerConnectionsRef.current.entries()) {
          for (const t of stream.getTracks()) {
            const matchingTransceiver = pc.getTransceivers().find(
              (tr) => tr.sender?.track?.kind === t.kind || tr.receiver?.track?.kind === t.kind
            );
            if (matchingTransceiver) {
              try {
                matchingTransceiver.direction = 'sendrecv';
                await matchingTransceiver.sender.replaceTrack(t);
              } catch {}
            } else {
              pc.addTrack(t, stream);
            }
          }
          await applyStudioEncoderTuning(pc, videoQuality);
          if (pc.signalingState === 'stable') {
            try {
              const offer = await pc.createOffer();
              const tunedSdp = preferRobustOpusSdp(offer.sdp);
              const tunedOffer = tunedSdp ? { type: offer.type, sdp: tunedSdp } : offer;
              await pc.setLocalDescription(tunedOffer);
              wsRef.current?.send(
                JSON.stringify({
                  type: 'webrtc-signal',
                  roomId: ROOM_ID,
                  targetPeerId: peerId,
                  signal: { sdp: tunedOffer },
                })
              );
            } catch {}
          }
        }
        wsMediaSenderRef.current?.ensureAudioCapture();
      }

      unlockRemoteAudio();
      broadcastMediaState({ isVideoOn: hasVideo, isMicOn: hasAudio });
    } finally {
      setRequestingMedia(false);
    }
  };

  const handleToggleMic = async () => {
    unlockRemoteAudio();
    const tracks = localStreamRef.current?.getAudioTracks() || [];
    if (tracks.length === 0) {
      await handleRequestCameraPermission();
      return;
    }
    const next = !isMicOn;
    tracks.forEach((t) => {
      t.enabled = next;
    });
    if (liveKitRoomRef.current?.localParticipant?.audioTrackPublications) {
      liveKitRoomRef.current.localParticipant.audioTrackPublications.forEach((pub: any) => {
        if (next) pub.unmute?.().catch(() => {});
        else pub.mute?.().catch(() => {});
      });
    }
    isMicOnRef.current = next;
    setIsMicOn(next);
    if (!next) setMyVolume(0);
    broadcastMediaState({ isMicOn: next });
  };

  const handleToggleVideo = async () => {
    unlockRemoteAudio();
    const tracks = localStreamRef.current?.getVideoTracks() || [];
    if (tracks.length === 0) {
      await handleRequestCameraPermission();
      return;
    }
    const next = !isVideoOn;
    tracks.forEach((t) => {
      t.enabled = next;
    });
    if (liveKitRoomRef.current?.localParticipant?.videoTrackPublications) {
      liveKitRoomRef.current.localParticipant.videoTrackPublications.forEach((pub: any) => {
        if (next) pub.unmute?.().catch(() => {});
        else pub.mute?.().catch(() => {});
      });
    }
    isVideoOnRef.current = next || isScreenSharingRef.current;
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
          width: { ideal: spec.width, min: 240 },
          height: { ideal: spec.height, min: 180 },
          frameRate: { ideal: videoQuality === '360p' ? 18 : 24, max: 24 },
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
        if (liveKitRoomRef.current) {
          const { Track } = await import('livekit-client');
          const existingCamPub = liveKitRoomRef.current.localParticipant.getTrackPublication(Track.Source.Camera);
          if (existingCamPub?.track) {
            await existingCamPub.track.replaceTrack(newVideoTrack, true).catch(() => {});
            if (existingCamPub.track.sender) applySenderPriority(existingCamPub.track.sender, 'video', videoQuality);
          }
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
        if (liveKitRoomRef.current) {
          const { Track } = await import('livekit-client');
          const existingCamPub = liveKitRoomRef.current.localParticipant.getTrackPublication(Track.Source.Camera);
          if (existingCamPub?.track) {
            await existingCamPub.track.replaceTrack(camTrack, true).catch(() => {});
          }
        }
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

        if (liveKitRoomRef.current) {
          const { Track } = await import('livekit-client');
          const existingCamPub = liveKitRoomRef.current.localParticipant.getTrackPublication(Track.Source.Camera);
          if (existingCamPub?.track) {
            await existingCamPub.track.replaceTrack(screenTrack, true).catch(() => {});
          } else {
            await liveKitRoomRef.current.localParticipant
              .publishTrack(screenTrack, { source: Track.Source.ScreenShare, simulcast: true })
              .catch(() => {});
          }
        }
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
            if (liveKitRoomRef.current) {
              import('livekit-client').then(({ Track }) => {
                const existingCamPub = liveKitRoomRef.current?.localParticipant?.getTrackPublication(Track.Source.Camera);
                if (existingCamPub?.track) {
                  existingCamPub.track.replaceTrack(camTrack, true).catch(() => {});
                }
              });
            }
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
    const trimmed = text.trim();
    if (!trimmed) return;
    const sender = user.baptismalName || user.fullName;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'assembly-chat',
          roomId: ROOM_ID,
          sender,
          text: trimmed,
          time,
        })
      );
    }
    if (auth.currentUser && auth.currentUser.emailVerified) {
      sendAbatRoomMessage({
        roomId: ROOM_ID,
        senderName: sender || 'ተሳታፊ',
        isPriest: user.role === 'priest' || user.role === 'admin',
        text: trimmed,
        timeLabel: time,
      }).catch((err) => console.warn('abat_messages send notice:', err?.message || err));
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

  const handleSwapZoomTarget = async (nextId: string) => {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    }
    setExpandedTileId(nextId);
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

  const stageRemotePeers = remotePeers.filter((p) => p.onStage !== false || p.role === 'priest' || p.stream !== null || Boolean(p.relayFrame));
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
            <option value="1080p">{QUALITY_MAP['1080p'].label}</option>
            <option value="720p">{QUALITY_MAP['720p'].label}</option>
            <option value="360p">{QUALITY_MAP['360p'].label}</option>
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

      {wsDiagnostic && (
        <div className="p-3 rounded-xl bg-red-950/85 border border-red-600/70 text-xs text-red-100 font-bold flex flex-wrap items-center justify-between gap-2.5 shadow-lg">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{wsDiagnostic}</span>
          </div>
          <button
            type="button"
            onClick={() => setWsReconnectNonce((n) => n + 1)}
            className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 text-xs font-extrabold transition shrink-0"
          >
            እንደገና አገናኝ
          </button>
        </div>
      )}

      {audioBlocked && (
        <div className="p-3 rounded-xl bg-emerald-950/90 border border-emerald-500 text-xs text-emerald-100 font-extrabold flex flex-wrap items-center justify-between gap-2.5 shadow-lg">
          <span>🔊 የሌሎችን ድምፅ ለመስማት የብራውዘሩን ድምፅ አንዴ ይክፈቱ</span>
          <button
            type="button"
            onClick={unlockRemoteAudio}
            className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-extrabold text-xs transition"
          >
            ድምፅ ክፈት (Unmute)
          </button>
        </div>
      )}

      {mediaWarning && (
        <div className="p-3 rounded-xl bg-amber-950/80 border border-amber-600/70 text-xs text-amber-100 font-bold flex flex-wrap items-center justify-between gap-2.5 shadow-lg">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{mediaWarning}</span>
          </div>
          <button
            type="button"
            onClick={handleRequestCameraPermission}
            disabled={requestingMedia}
            className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 border border-emerald-400 text-white text-xs font-extrabold inline-flex items-center gap-1.5 transition shrink-0"
          >
            <Video className="w-3.5 h-3.5" />
            <span>{requestingMedia ? 'በመፍቀድ ላይ...' : 'ካሜራና ማይክ ፍቀድ / ክፈት'}</span>
          </button>
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
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-900 text-stone-200 p-4 text-center space-y-3">
                    <div className="w-16 h-16 rounded-full bg-stone-800 border-2 border-amber-600/50 flex items-center justify-center text-xl font-extrabold text-amber-200">
                      {(user.baptismalName || user.fullName || 'እ').charAt(0)}
                    </div>
                    <p className="text-sm text-stone-100 font-extrabold">
                      {user.baptismalName || user.fullName} (ካሜራ ዝግ ነው)
                    </p>
                    <button
                      type="button"
                      onClick={handleToggleVideo}
                      disabled={requestingMedia}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-400 text-white text-xs font-extrabold inline-flex items-center gap-1.5 shadow-lg transition"
                    >
                      <Video className="w-4 h-4" />
                      <span>{requestingMedia ? 'በመክፈት ላይ...' : 'ካሜራ ክፈት / ፍቀድ'}</span>
                    </button>
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

                {/* When Self tile is zoomed/expanded, display one remote participant in the bottom-right corner */}
                {isSelfExpanded && stageRemotePeers[0] && (
                  <PipCornerTile
                    label={stageRemotePeers[0].baptismalName || stageRemotePeers[0].userName}
                    stream={stageRemotePeers[0].stream}
                    relayFrame={stageRemotePeers[0].relayFrame}
                    isVideoOn={stageRemotePeers[0].isVideoOn}
                    isMicOn={stageRemotePeers[0].isMicOn}
                    onClick={() => handleSwapZoomTarget(stageRemotePeers[0].peerId)}
                  />
                )}
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
                  onUnlockAudio={unlockRemoteAudio}
                  onVideoHealthChange={handlePeerVideoHealthChange}
                  tallStage={true}
                  pipCorner={
                    expandedTileId === peer.peerId
                      ? {
                          label: `${user.baptismalName || user.fullName} (እኔ)`,
                          stream: screenStreamRef.current || localStreamRef.current,
                          isVideoOn: isVideoOn || isScreenSharing,
                          isMicOn,
                          mirror: !isScreenSharing && facingMode === 'user',
                          onClick: () => handleSwapZoomTarget('self'),
                        }
                      : null
                  }
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
                    onUnlockAudio={unlockRemoteAudio}
                    onVideoHealthChange={handlePeerVideoHealthChange}
                    tallStage={true}
                    pipCorner={{
                      label: `${user.baptismalName || user.fullName} (እኔ)`,
                      stream: screenStreamRef.current || localStreamRef.current,
                      isVideoOn: isVideoOn || isScreenSharing,
                      isMicOn,
                      mirror: !isScreenSharing && facingMode === 'user',
                      onClick: () => handleSwapZoomTarget('self'),
                    }}
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
                        onUnlockAudio={unlockRemoteAudio}
                        onVideoHealthChange={handlePeerVideoHealthChange}
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

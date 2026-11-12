import React, { useState, useEffect, useRef } from 'react';
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
  Radio,
  MessageSquare,
  Share2,
  Smile,
  Shield,
  PhoneOff,
  LayoutGrid,
  Square,
  Sparkles,
  Pin,
  RefreshCw,
  MoreVertical,
  Check,
  Flame,
} from 'lucide-react';
import { UserProfile } from '../types';
import { toggleSpiritualHymn, stopSpiritualHymn, playChurchBell } from '../utils/audio';

interface AssemblyHallProps {
  user: UserProfile;
}

interface ParticipantTile {
  id: string;
  name: string;
  baptismalName: string;
  role: 'host' | 'co-host' | 'cantor' | 'attendee';
  avatar: string;
  isVideoOn: boolean;
  isMicOn: boolean;
  isHandRaised: boolean;
  isSpeaking: boolean;
  audioLevel: number;
  isPinned?: boolean;
  videoUrl?: string;
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

export const AssemblyHall: React.FC<AssemblyHallProps> = ({ user }) => {
  // Zoom Conference Layout State
  const [viewMode, setViewMode] = useState<'gallery' | 'speaker'>('gallery');
  const [activeTabPanel, setActiveTabPanel] = useState<'chat' | 'participants' | 'none'>('chat');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // Current User Media Stream
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [myVolume, setMyVolume] = useState(0);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [audioHymnPlaying, setAudioHymnPlaying] = useState(false);
  const [isMutedAllAudio, setIsMutedAllAudio] = useState(false);

  // Real Remote WebRTC Peer Video Stream
  const [remotePeerVideoConnected, setRemotePeerVideoConnected] = useState(false);
  const [remotePeerName, setRemotePeerName] = useState('ምዕመን (በቀጥታ ቪዲዮ)');

  // Dynamic Attendees
  const [attendeeCount, setAttendeeCount] = useState(12480);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string>('priest-1');
  const [spotlightId, setSpotlightId] = useState<string | null>(null);

  // Chat & Q&A
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: '1', sender: 'ቀሲስ ሄኖክ (አስተማሪ)', text: 'በስመ አብ ወወልድ ወመንፈስ ቅዱስ አሐዱ አምላክ አሜን። እንኳን ወደ ታላቁ የዙም ጉባኤ በደህና መጣችሁ።', time: '10:00', isPriest: true },
    { id: '2', sender: 'ማርታ አለሙ', text: 'አሜን! ቃለ ሕይወትን ያሰማልን አባታችን', time: '10:02' },
    { id: '3', sender: 'ዲ/ን አማኑኤል ተስፋዬ', text: 'ቀጥታ አስተምህሮው ጀምሯል፤ ጥያቄ ወይም ሀሳብ ያላችሁ እጅ አውጡ (Raise Hand) ምልክት ተጫኑ', time: '10:04' },
    { id: '4', sender: 'ተክለ ሃይማኖት ካሳ', text: 'እግዚአብሔር ያክብርልን፤ በረከቱ ይደርብን አሜን!', time: '10:06' },
  ]);
  const [newChatText, setNewChatText] = useState('');
  const [showReactionsMenu, setShowReactionsMenu] = useState(false);

  // Other Participants in the Zoom Gallery
  const [participants, setParticipants] = useState<ParticipantTile[]>([
    {
      id: 'priest-1',
      name: 'ቀሲስ ሄኖክ',
      baptismalName: 'ገብረ ክርስቶስ',
      role: 'host',
      avatar: '/src/assets/images/priest_blessing_hero_1794468346711.jpg',
      isVideoOn: true,
      isMicOn: true,
      isHandRaised: false,
      isSpeaking: true,
      audioLevel: 82,
    },
    {
      id: 'deacon-1',
      name: 'ዲ/ን አማኑኤል ተስፋዬ',
      baptismalName: 'ወልደ ሩፋኤል',
      role: 'co-host',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80',
      isVideoOn: true,
      isMicOn: false,
      isHandRaised: false,
      isSpeaking: false,
      audioLevel: 0,
    },
    {
      id: 'cantor-1',
      name: 'መ/ር ታደሰ ወርቁ',
      baptismalName: 'ገብረ መድኅን',
      role: 'cantor',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
      isVideoOn: true,
      isMicOn: false,
      isHandRaised: true,
      isSpeaking: false,
      audioLevel: 0,
    },
    {
      id: 'attendee-1',
      name: 'ማርታ አለሙ',
      baptismalName: 'ወለተ ኪዳን',
      role: 'attendee',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
      isVideoOn: true,
      isMicOn: false,
      isHandRaised: false,
      isSpeaking: false,
      audioLevel: 0,
    },
    {
      id: 'attendee-2',
      name: 'ተክለ ሃይማኖት ካሳ',
      baptismalName: 'ኃይለ ማርያም',
      role: 'attendee',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
      isVideoOn: true,
      isMicOn: false,
      isHandRaised: true,
      isSpeaking: false,
      audioLevel: 0,
    },
    {
      id: 'attendee-3',
      name: 'ሰሎሜ ተፈራ',
      baptismalName: 'ወለተ ሰማዕት',
      role: 'attendee',
      avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80',
      isVideoOn: true,
      isMicOn: false,
      isHandRaised: false,
      isSpeaking: false,
      audioLevel: 0,
    },
  ]);

  // Refs for media and connections
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenShareVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const meetingContainerRef = useRef<HTMLDivElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Initialize Local Camera & Microphone
  const startCameraAndMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      // Voice level visualizer
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        if (analyserRef.current && isMicOn) {
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const avg = sum / dataArray.length;
          const level = Math.min(100, Math.round((avg / 128) * 100));
          setMyVolume(level);
          if (level > 25) {
            setActiveSpeakerId('me');
          }
        } else {
          setMyVolume(0);
        }
        animFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      // Audio track initial state is muted until user clicks unmute
      stream.getAudioTracks().forEach((track) => {
        track.enabled = isMicOn;
      });

      // Hook tracks to peer connection if ready
      if (pcRef.current) {
        stream.getTracks().forEach((t) => pcRef.current?.addTrack(t, stream));
      }
    } catch (err) {
      console.warn('Camera/Mic permission info:', err);
    }
  };

  // Setup WebRTC and WebSocket for live Multi-Device Zoom Calls
  useEffect(() => {
    startCameraAndMic();

    // 1. Setup WebRTC Peer Connection with Google STUN servers
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });
    pcRef.current = pc;

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        remoteStreamRef.current = event.streams[0];
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
          remoteVideoRef.current.play().catch(() => {});
        }
        setRemotePeerVideoConnected(true);
      }
    };

    // 2. Setup WebSocket Connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/realtime`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    pc.onicecandidate = (event) => {
      if (event.candidate && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'webrtc-signal',
          roomId: 'assembly-zoom-main',
          signal: { candidate: event.candidate },
        }));
      }
    };

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'join-room',
        roomId: 'assembly-zoom-main',
        userId: user.id || 'usr-guest-' + Math.random().toString(36).substring(7),
        userName: user.baptismalName || user.fullName,
        role: user.role === 'priest' ? 'priest' : 'attendee',
      }));
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        // A. Multi-user WebRTC peer joined
        if (data.type === 'peer-joined') {
          if (data.userName) setRemotePeerName(data.userName);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          ws.send(JSON.stringify({
            type: 'webrtc-signal',
            roomId: 'assembly-zoom-main',
            signal: { sdp: offer },
          }));
        }

        // B. WebRTC SDP & ICE signals
        else if (data.type === 'webrtc-signal' && data.signal) {
          const { signal } = data;
          if (signal.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            if (signal.sdp.type === 'offer') {
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              ws.send(JSON.stringify({
                type: 'webrtc-signal',
                roomId: 'assembly-zoom-main',
                signal: { sdp: answer },
              }));
              setRemotePeerVideoConnected(true);
            }
          } else if (signal.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          }
        }

        // C. Live Chat Messages
        else if (data.type === 'assembly-chat-message') {
          setChatMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              sender: data.sender,
              text: data.text,
              time: data.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ]);
        }

        // D. Raised Hand State Broadcast
        else if (data.type === 'assembly-hand-state-update') {
          setParticipants((prev) =>
            prev.map((p) =>
              p.name.includes(data.userName || '')
                ? { ...p, isHandRaised: data.handRaised }
                : p
            )
          );
        }

        // E. Reaction Broadcast
        else if (data.type === 'assembly-reaction-broadcast') {
          triggerReaction(data.emoji, data.sender);
        }

        // F. Peer Left
        else if (data.type === 'peer-left') {
          setRemotePeerVideoConnected(false);
        }
      } catch (err) {
        console.warn('WS handling notice:', err);
      }
    };

    // Simulated talking loop for Qesis Henok when mic is on
    const talkingTimer = setInterval(() => {
      setParticipants((prev) =>
        prev.map((p) => {
          if (p.id === 'priest-1') {
            const nextSpeaking = Math.random() > 0.25;
            return {
              ...p,
              isSpeaking: nextSpeaking,
              audioLevel: nextSpeaking ? Math.floor(65 + Math.random() * 30) : 0,
            };
          }
          return p;
        })
      );
    }, 2800);

    return () => {
      clearInterval(talkingTimer);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (pcRef.current) {
        pcRef.current.close();
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      stopSpiritualHymn();
    };
  }, [facingMode]);

  // Keep chat scrolled to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Toggle Video Track
  const handleToggleVideo = () => {
    const nextState = !isVideoOn;
    setIsVideoOn(nextState);
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = nextState;
      });
    }
  };

  // Toggle Microphone Track
  const handleToggleMic = () => {
    const nextState = !isMicOn;
    setIsMicOn(nextState);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = nextState;
      });
    }
    if (!nextState) {
      setMyVolume(0);
      if (activeSpeakerId === 'me') {
        setActiveSpeakerId('priest-1');
      }
    } else {
      setActiveSpeakerId('me');
    }

    // Broadcast mic state via WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'assembly-mic-state',
        isMicActive: nextState,
        userName: user.baptismalName || user.fullName,
      }));
    }
  };

  // Flip Camera (Front / Back for mobile devices)
  const handleFlipCamera = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  // Raise Hand to speak / give feedback (ሀሳብ ለመስጠት)
  const handleToggleHand = () => {
    const nextState = !isHandRaised;
    setIsHandRaised(nextState);
    if (nextState) {
      playChurchBell();
      triggerReaction('✋', user.baptismalName || user.fullName);
    }

    // Broadcast via WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'assembly-hand-state',
        handRaised: nextState,
        userName: user.baptismalName || user.fullName,
      }));
    }
  };

  // Screen Sharing (ስክሪን አጋራ)
  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      setIsScreenSharing(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
        });
        screenStreamRef.current = stream;
        if (screenShareVideoRef.current) {
          screenShareVideoRef.current.srcObject = stream;
          screenShareVideoRef.current.play().catch(() => {});
        }
        setIsScreenSharing(true);
        stream.getVideoTracks()[0].onended = () => {
          setIsScreenSharing(false);
        };
      } catch (err) {
        console.warn('Screen share notice:', err);
      }
    }
  };

  // Trigger floating reaction on screen
  const triggerReaction = (emoji: string, sender: string) => {
    const id = Date.now() + Math.random();
    const x = Math.floor(15 + Math.random() * 70);
    setFloatingReactions((prev) => [...prev, { id, emoji, sender, x }]);
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2800);
  };

  const handleSendReaction = (emoji: string) => {
    triggerReaction(emoji, user.baptismalName || user.fullName);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'assembly-reaction',
        emoji,
        sender: user.baptismalName || user.fullName,
      }));
    }
    setShowReactionsMenu(false);
  };

  // Send Chat message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatText.trim()) return;
    const text = newChatText.trim();
    const sender = user.baptismalName || user.fullName;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'assembly-chat',
        sender,
        text,
        time,
      }));
    } else {
      setChatMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), sender, text, time },
      ]);
    }
    setNewChatText('');
  };

  // Toggle Fullscreen
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      meetingContainerRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Allow participant to speak (Host control)
  const handleSpotlightParticipant = (participantId: string) => {
    setSpotlightId((prev) => (prev === participantId ? null : participantId));
    setActiveSpeakerId(participantId);
  };

  return (
    <div
      ref={meetingContainerRef}
      className="max-w-[1560px] mx-auto px-2 sm:px-4 lg:px-6 py-4 space-y-3 min-h-[calc(100vh-80px)] flex flex-col justify-between select-none"
    >
      {/* 1. ZOOM MEETING TOP HEADER BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-stone-950/90 border border-amber-800/40 backdrop-blur-md shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-red-950/80 border border-red-700/60 text-red-300 font-bold text-xs">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            <span className="uppercase tracking-wider">ቀጥታ የዙም ጉባኤ (LIVE ZOOM)</span>
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-heading font-bold text-amber-100 flex items-center gap-2">
              <span>የንስሐ ሕይወትና የልብ ንጽሕና</span>
              <span className="text-xs font-normal text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-800/40 hidden md:inline">
                በቀሲስ ሄኖክ (የጉባኤው መሪ)
              </span>
            </h2>
          </div>
        </div>

        {/* Meeting ID, Encryption & View Mode Switcher */}
        <div className="flex items-center gap-2">
          {/* E2E Security Badge */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-stone-900 border border-emerald-700/50 text-[11px] text-emerald-300">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>ጥብቅ ሚስጥር (P2P WebRTC HD)</span>
          </div>

          {/* Attendees Count */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-stone-900 border border-stone-800 text-xs text-amber-200">
            <Users className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-bold">{attendeeCount.toLocaleString()}</span>
          </div>

          {/* Gallery View vs Speaker View Toggle Buttons */}
          <div className="flex items-center p-1 rounded-xl bg-stone-900 border border-stone-800">
            <button
              onClick={() => setViewMode('gallery')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition ${
                viewMode === 'gallery'
                  ? 'bg-amber-900/80 text-amber-200 font-bold shadow-md'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
              title="የጋለሪ እይታ (ሁሉም ፊት ለፊት የሚተያዩበት)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">የጋለሪ እይታ (Gallery)</span>
            </button>
            <button
              onClick={() => setViewMode('speaker')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition ${
                viewMode === 'speaker'
                  ? 'bg-amber-900/80 text-amber-200 font-bold shadow-md'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
              title="የስፒከር እይታ (ቀሲስ ሄኖክ ጎልቶ የሚታይበት)"
            >
              <Square className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">የስፒከር እይታ (Speaker)</span>
            </button>
          </div>

          {/* Fullscreen Button */}
          <button
            onClick={handleToggleFullscreen}
            className="p-2 rounded-xl bg-stone-900 border border-stone-800 text-stone-300 hover:text-amber-200 transition"
            title="ሙሉ ማያ (Fullscreen)"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Floating Animated Reactions Container */}
      <div className="relative overflow-visible pointer-events-none">
        {floatingReactions.map((r) => (
          <div
            key={r.id}
            className="absolute bottom-12 pointer-events-none z-50 flex items-center gap-1.5 animate-bounce-slow"
            style={{ left: `${r.x}%` }}
          >
            <span className="text-3xl filter drop-shadow-lg">{r.emoji}</span>
            <span className="text-[10px] bg-stone-950/80 text-amber-200 px-1.5 py-0.5 rounded border border-amber-700/40">
              {r.sender}
            </span>
          </div>
        ))}
      </div>

      {/* 2. MAIN ZOOM VIDEO STAGE & PARTICIPANT GRID */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-[480px]">
        
        {/* VIDEO CONFERENCING GRID AREA (8 or 12 Cols depending on active drawer) */}
        <div className={`${activeTabPanel !== 'none' ? 'lg:col-span-8 xl:col-span-9' : 'lg:col-span-12'} flex flex-col justify-center space-y-3`}>
          
          {/* A. SCREEN SHARING VIEW (If Screen Share is Active) */}
          {isScreenSharing && (
            <div className="relative rounded-2xl overflow-hidden bg-black border-2 border-emerald-500 shadow-2xl h-[420px] mb-3">
              <video
                ref={screenShareVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-contain bg-stone-950"
              />
              <div className="absolute top-3 left-3 bg-stone-950/90 px-3 py-1 rounded-lg border border-emerald-500/50 text-xs text-emerald-300 flex items-center gap-2">
                <Share2 className="w-4 h-4 text-emerald-400 animate-pulse" />
                <span>ስክሪን እያጋሩ ነው (መጽሐፍ ቅዱስ / ማስታወሻ)</span>
              </div>
              <button
                onClick={handleToggleScreenShare}
                className="absolute top-3 right-3 bg-red-900/80 hover:bg-red-800 text-white text-xs px-3 py-1.5 rounded-lg border border-red-600 transition"
              >
                ስክሪን ማጋራት አቁም
              </button>
            </div>
          )}

          {/* B. ZOOM GALLERY VIEW: EVERYONE SEES EACH OTHER FACE-TO-FACE IN A DYNAMIC VIDEO GRID */}
          {viewMode === 'gallery' && !isScreenSharing && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 w-full">
              
              {/* TILE 1: QESIS HENOK (THE SPIRITUAL FATHER & HOST) */}
              <div
                className={`relative rounded-2xl overflow-hidden bg-stone-950 border-2 transition-all shadow-xl group aspect-[16/10] flex flex-col justify-between ${
                  activeSpeakerId === 'priest-1' || spotlightId === 'priest-1'
                    ? 'border-emerald-500 ring-2 ring-emerald-500/50 shadow-emerald-950/50'
                    : 'border-amber-700/50'
                }`}
              >
                <img
                  src="/src/assets/images/priest_blessing_hero_1794468346711.jpg"
                  alt="ቀሲስ ሄኖክ እያስተማሩ"
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-cover filter brightness-95"
                />

                {/* Top Badge: Name & Role */}
                <div className="relative z-10 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 bg-stone-950/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-amber-600/50 text-xs text-amber-200">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="font-bold">ቀሲስ ሄኖክ (የጉባኤው መሪ / Host)</span>
                  </div>
                  <button
                    onClick={() => handleSpotlightParticipant('priest-1')}
                    className="p-1.5 rounded-lg bg-stone-900/80 text-amber-300 hover:bg-stone-800 border border-amber-800/50 transition"
                    title="ስክሪኑን አጉላ (Pin Spotlight)"
                  >
                    <Pin className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Bottom Status Bar: Speaking Indicator & Mic */}
                <div className="relative z-10 p-3 flex items-center justify-between bg-gradient-to-t from-black/90 via-black/40 to-transparent">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-md bg-emerald-950/80 border border-emerald-500/60 text-emerald-300">
                      <Mic className="w-3.5 h-3.5 animate-pulse" />
                    </span>
                    {/* Live Voice Waveform */}
                    <div className="flex items-end gap-1 h-4">
                      {[30, 80, 50, 95, 60, 85, 40].map((h, i) => (
                        <span
                          key={i}
                          className="w-1 bg-emerald-400 rounded-full transition-all duration-200"
                          style={{ height: `${h}%` }}
                        />
                      ))}
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-300 bg-stone-950/80 px-2 py-0.5 rounded border border-emerald-600/40">
                    እያስተማሩ ይገኛሉ (HD)
                  </span>
                </div>
              </div>

              {/* TILE 2: MY LIVE VIDEO (THE USER'S REAL WEBCAM / FRONT CAMERA) */}
              <div
                className={`relative rounded-2xl overflow-hidden bg-stone-950 border-2 transition-all shadow-xl aspect-[16/10] flex flex-col justify-between ${
                  isMicOn && myVolume > 20
                    ? 'border-emerald-400 ring-2 ring-emerald-400/50'
                    : isHandRaised
                    ? 'border-amber-400 ring-2 ring-amber-400/40'
                    : 'border-amber-800/40'
                }`}
              >
                {/* Live Real Video Feed */}
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`absolute inset-0 w-full h-full object-cover mirror ${
                    isVideoOn ? 'block' : 'hidden'
                  }`}
                />

                {!isVideoOn && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-900 text-stone-400 p-4 text-center">
                    <div className="w-14 h-14 rounded-full bg-stone-800 border border-stone-700 flex items-center justify-center text-lg font-bold text-amber-200 mb-2">
                      {user.fullName.charAt(0)}
                    </div>
                    <p className="text-xs text-stone-300 font-medium">{user.baptismalName} (ካሜራ ዝግ ነው)</p>
                  </div>
                )}

                {/* Top Badge: Name & Hand Raised Status */}
                <div className="relative z-10 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 bg-stone-950/85 backdrop-blur-md px-2.5 py-1 rounded-lg border border-amber-600/50 text-xs text-amber-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="font-bold">{user.baptismalName} (እኔ)</span>
                  </div>
                  {isHandRaised && (
                    <div className="flex items-center gap-1 bg-amber-500 text-stone-950 px-2 py-0.5 rounded-lg text-xs font-bold animate-bounce shadow">
                      <Hand className="w-3.5 h-3.5" />
                      <span>ሀሳብ አለኝ</span>
                    </div>
                  )}
                </div>

                {/* Bottom Bar: Mute State & Flip Camera */}
                <div className="relative z-10 p-3 flex items-center justify-between bg-gradient-to-t from-black/90 via-black/40 to-transparent">
                  <div className="flex items-center gap-2">
                    <span
                      className={`p-1.5 rounded-md border ${
                        isMicOn
                          ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                          : 'bg-red-950/80 border-red-700 text-red-300'
                      }`}
                    >
                      {isMicOn ? <Mic className="w-3.5 h-3.5 animate-pulse" /> : <MicOff className="w-3.5 h-3.5" />}
                    </span>
                    {isMicOn && (
                      <div className="w-12 h-1.5 bg-stone-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 transition-all duration-75"
                          style={{ width: `${myVolume}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleFlipCamera}
                    className="p-1.5 rounded-lg bg-stone-900/80 text-stone-300 hover:text-amber-200 border border-stone-700 transition"
                    title="ካሜራ ቀይር (Flip)"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* TILE 3: REAL REMOTE WEBRTC VIDEO PEER (When opened from 2nd phone or laptop) */}
              <div
                className={`relative rounded-2xl overflow-hidden bg-stone-950 border-2 transition-all shadow-xl aspect-[16/10] flex flex-col justify-between ${
                  remotePeerVideoConnected ? 'border-emerald-500' : 'border-stone-800'
                }`}
              >
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className={`absolute inset-0 w-full h-full object-cover ${
                    remotePeerVideoConnected ? 'block' : 'hidden'
                  }`}
                />

                {!remotePeerVideoConnected && (
                  <img
                    src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80"
                    alt="ዲ/ን አማኑኤል ተስፋዬ"
                    className="absolute inset-0 w-full h-full object-cover filter brightness-90"
                  />
                )}

                <div className="relative z-10 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 bg-stone-950/85 backdrop-blur-md px-2.5 py-1 rounded-lg border border-stone-700 text-xs text-amber-200">
                    <span className={`w-2 h-2 rounded-full ${remotePeerVideoConnected ? 'bg-emerald-400' : 'bg-stone-400'}`} />
                    <span className="font-semibold">
                      {remotePeerVideoConnected ? remotePeerName : 'ዲ/ን አማኑኤል ተስፋዬ'}
                    </span>
                  </div>
                  <span className="text-[10px] bg-stone-900/90 text-stone-400 px-2 py-0.5 rounded border border-stone-800">
                    {remotePeerVideoConnected ? 'ቀጥታ ቪዲዮ' : 'ዲያቆን'}
                  </span>
                </div>

                <div className="relative z-10 p-3 flex items-center justify-between bg-gradient-to-t from-black/90 via-black/40 to-transparent">
                  <span className="p-1.5 rounded-md bg-stone-900 text-stone-400 border border-stone-800">
                    <MicOff className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-[10px] text-stone-400">ማይክ ዝግ ነው</span>
                </div>
              </div>

              {/* TILE 4: MEMHIR TADESSE (CANTOR & SCHOLAR - GIVING LIVE FEEDBACK / QUESTION) */}
              <div className="relative rounded-2xl overflow-hidden bg-stone-950 border-2 border-stone-800 aspect-[16/10] flex flex-col justify-between shadow-xl">
                <img
                  src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80"
                  alt="መ/ር ታደሰ ወርቁ"
                  className="absolute inset-0 w-full h-full object-cover filter brightness-90"
                />
                <div className="relative z-10 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 bg-stone-950/85 backdrop-blur-md px-2.5 py-1 rounded-lg border border-stone-700 text-xs text-amber-200">
                    <span className="font-semibold">መ/ር ታደሰ ወርቁ</span>
                  </div>
                  <div className="flex items-center gap-1 bg-amber-500/90 text-stone-950 px-2 py-0.5 rounded-lg text-[11px] font-bold">
                    <Hand className="w-3 h-3" />
                    <span>እጅ አውጥቷል</span>
                  </div>
                </div>
                <div className="relative z-10 p-3 flex items-center justify-between bg-gradient-to-t from-black/90 to-transparent">
                  <span className="p-1.5 rounded-md bg-stone-900 text-stone-400 border border-stone-800">
                    <MicOff className="w-3.5 h-3.5" />
                  </span>
                  <button
                    onClick={() => {
                      triggerReaction('✋', 'መ/ር ታደሰ ወርቁ');
                      alert('ለመምህር ታደሰ ወርቁ የመናገርና ሀሳብ የመስጠት ማይክ ተፈቅዷል!');
                    }}
                    className="text-[10px] bg-amber-950/80 hover:bg-amber-900 text-amber-200 px-2.5 py-1 rounded border border-amber-600/50 transition"
                  >
                    ማይክ ፍቀድለት
                  </button>
                </div>
              </div>

              {/* TILE 5: MARTHA ALEMU (ATTENDEE PARTICIPANT) */}
              <div className="relative rounded-2xl overflow-hidden bg-stone-950 border-2 border-stone-800 aspect-[16/10] flex flex-col justify-between shadow-xl">
                <img
                  src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80"
                  alt="ማርታ አለሙ"
                  className="absolute inset-0 w-full h-full object-cover filter brightness-90"
                />
                <div className="relative z-10 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 bg-stone-950/85 backdrop-blur-md px-2.5 py-1 rounded-lg border border-stone-700 text-xs text-stone-200">
                    <span>ማርታ አለሙ (ወለተ ኪዳን)</span>
                  </div>
                </div>
                <div className="relative z-10 p-3 flex items-center justify-between bg-gradient-to-t from-black/90 to-transparent">
                  <span className="p-1.5 rounded-md bg-stone-900 text-stone-400 border border-stone-800">
                    <MicOff className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-[10px] text-stone-400">ምዕመን</span>
                </div>
              </div>

              {/* TILE 6: TEKLE HAYMANOT KASSA (ATTENDEE PARTICIPANT) */}
              <div className="relative rounded-2xl overflow-hidden bg-stone-950 border-2 border-stone-800 aspect-[16/10] flex flex-col justify-between shadow-xl">
                <img
                  src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80"
                  alt="ተክለ ሃይማኖት ካሳ"
                  className="absolute inset-0 w-full h-full object-cover filter brightness-90"
                />
                <div className="relative z-10 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 bg-stone-950/85 backdrop-blur-md px-2.5 py-1 rounded-lg border border-stone-700 text-xs text-stone-200">
                    <span>ተክለ ሃይማኖት (ኃይለ ማርያም)</span>
                  </div>
                </div>
                <div className="relative z-10 p-3 flex items-center justify-between bg-gradient-to-t from-black/90 to-transparent">
                  <span className="p-1.5 rounded-md bg-stone-900 text-stone-400 border border-stone-800">
                    <MicOff className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-[10px] text-stone-400">ምዕመን</span>
                </div>
              </div>

            </div>
          )}

          {/* C. ZOOM SPEAKER VIEW: QESIS HENOK (OR SPOTLIGHTED SPEAKER) IS BIG WITH ATTENDEE STRIP */}
          {viewMode === 'speaker' && !isScreenSharing && (
            <div className="space-y-3">
              {/* Main Speaker Large Stage */}
              <div className="relative rounded-2xl overflow-hidden bg-black border-2 border-amber-600/60 shadow-2xl h-[400px] sm:h-[480px]">
                <img
                  src="/src/assets/images/priest_blessing_hero_1794468346711.jpg"
                  alt="ቀሲስ ሄኖክ እያስተማሩ"
                  className="w-full h-full object-cover object-top filter brightness-95"
                />
                
                {/* Speaker Info Overlay */}
                <div className="absolute top-4 left-4 bg-stone-950/85 backdrop-blur-md p-3 rounded-xl border border-amber-500/60 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-950 border border-amber-400 flex items-center justify-center text-amber-300 font-bold">
                    ቀ
                  </div>
                  <div>
                    <h3 className="text-sm font-heading font-bold text-amber-200">
                      ቀሲስ ሄኖክ (የጉባኤው መሪ / ዋና አስተማሪ)
                    </h3>
                    <p className="text-xs text-emerald-400 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span>በቀጥታ የቪዲዮ አስተምህሮ ላይ ይገኛሉ</span>
                    </p>
                  </div>
                </div>

                {/* Picture in Picture: User Self Camera */}
                <div className="absolute bottom-4 right-4 w-36 sm:w-44 h-26 sm:h-32 rounded-xl overflow-hidden border-2 border-amber-400 shadow-2xl bg-stone-900">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover mirror"
                  />
                  <div className="absolute bottom-1 left-1 bg-stone-950/80 px-1.5 py-0.5 rounded text-[10px] text-amber-200">
                    {user.baptismalName} (እኔ)
                  </div>
                </div>
              </div>

              {/* Attendees Strip Below Speaker */}
              <div className="flex items-center gap-3 overflow-x-auto pb-2">
                {participants.slice(1).map((p) => (
                  <div
                    key={p.id}
                    onClick={() => handleSpotlightParticipant(p.id)}
                    className="w-36 h-24 rounded-xl overflow-hidden relative border border-stone-800 bg-stone-900 shrink-0 cursor-pointer hover:border-amber-500 transition"
                  >
                    <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                    <div className="absolute bottom-1 left-1 right-1 bg-stone-950/80 px-1 py-0.5 rounded text-[10px] text-stone-200 truncate">
                      {p.name}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* 3. RIGHT SIDE PANEL: LIVE CHAT & PARTICIPANTS ROSTER (ZOOM SIDEBAR) */}
        {activeTabPanel !== 'none' && (
          <div className="lg:col-span-4 xl:col-span-3 flex flex-col h-[520px] rounded-2xl bg-stone-950/90 border border-amber-900/40 overflow-hidden shadow-2xl">
            
            {/* Panel Tabs Header */}
            <div className="flex items-center justify-between p-2.5 bg-stone-900 border-b border-stone-800">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActiveTabPanel('chat')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    activeTabPanel === 'chat'
                      ? 'bg-amber-950 text-amber-200 border border-amber-700/60'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  የቀጥታ ቻትና ሀሳብ
                </button>
                <button
                  onClick={() => setActiveTabPanel('participants')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    activeTabPanel === 'participants'
                      ? 'bg-amber-950 text-amber-200 border border-amber-700/60'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  ተሳታፊዎች ({participants.length + 1})
                </button>
              </div>
              <button
                onClick={() => setActiveTabPanel('none')}
                className="text-stone-500 hover:text-stone-300 p-1 rounded"
                title="ፓነሉን ዝጋ"
              >
                ✕
              </button>
            </div>

            {/* A. LIVE CHAT PANEL */}
            {activeTabPanel === 'chat' && (
              <div className="flex-1 flex flex-col justify-between overflow-hidden">
                {/* Chat Messages Log */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                  {chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-2.5 rounded-xl border text-xs space-y-1 ${
                        msg.isPriest
                          ? 'bg-amber-950/60 border-amber-600/50 text-amber-100'
                          : 'bg-stone-900/80 border-stone-800 text-stone-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`font-bold ${msg.isPriest ? 'text-amber-300' : 'text-stone-300'}`}>
                          {msg.sender}
                        </span>
                        <span className="text-[10px] text-stone-500 font-mono">{msg.time}</span>
                      </div>
                      <p className="leading-relaxed">{msg.text}</p>
                    </div>
                  ))}
                  <div ref={chatBottomRef} />
                </div>

                {/* Quick Spiritual Responses */}
                <div className="p-2 bg-stone-900/80 border-t border-stone-800 flex gap-1.5 overflow-x-auto text-[11px]">
                  {['አሜን!', 'ቃለ ሕይወት ያሰማልን', 'አባታችን ይባርኩን', 'ጸልዩልን', 'እግዚአብሔር ይማረን'].map((phrase) => (
                    <button
                      key={phrase}
                      onClick={() => {
                        setChatMessages((prev) => [
                          ...prev,
                          {
                            id: Date.now().toString(),
                            sender: user.baptismalName || user.fullName,
                            text: phrase,
                            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                          },
                        ]);
                      }}
                      className="px-2 py-1 rounded bg-stone-950 border border-stone-800 hover:border-amber-600/50 text-amber-200 whitespace-nowrap transition"
                    >
                      {phrase}
                    </button>
                  ))}
                </div>

                {/* Chat Send Form */}
                <form onSubmit={handleSendMessage} className="p-2.5 bg-stone-950 border-t border-stone-800 flex gap-2">
                  <input
                    type="text"
                    value={newChatText}
                    onChange={(e) => setNewChatText(e.target.value)}
                    placeholder="ለቀሲስ ሄኖክ ወይም ለጉባኤው ሀሳብ ይጻፉ..."
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

            {/* B. PARTICIPANTS ROSTER PANEL */}
            {activeTabPanel === 'participants' && (
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                <div className="p-2 rounded-xl bg-stone-900 border border-stone-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-amber-500 text-stone-950 font-bold flex items-center justify-center text-xs">
                      ቀ
                    </div>
                    <div>
                      <p className="font-bold text-amber-200">ቀሲስ ሄኖክ</p>
                      <p className="text-[10px] text-amber-400">ዋና አስተማሪ (Host)</p>
                    </div>
                  </div>
                  <Mic className="w-3.5 h-3.5 text-emerald-400" />
                </div>

                <div className="p-2 rounded-xl bg-amber-950/40 border border-amber-800/40 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-stone-800 text-amber-200 font-bold flex items-center justify-center text-xs">
                      {user.fullName.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold text-amber-200">{user.baptismalName} (እኔ)</p>
                      <p className="text-[10px] text-stone-400">የንስሐ ልጅ</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isHandRaised && <Hand className="w-3.5 h-3.5 text-amber-400 animate-bounce" />}
                    {isMicOn ? <Mic className="w-3.5 h-3.5 text-emerald-400" /> : <MicOff className="w-3.5 h-3.5 text-red-400" />}
                  </div>
                </div>

                {participants.slice(1).map((p) => (
                  <div key={p.id} className="p-2 rounded-xl bg-stone-900/60 border border-stone-800 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <img src={p.avatar} alt={p.name} className="w-7 h-7 rounded-full object-cover" />
                      <div>
                        <p className="text-stone-200 font-medium">{p.name}</p>
                        <p className="text-[10px] text-stone-500">{p.baptismalName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {p.isHandRaised && <Hand className="w-3.5 h-3.5 text-amber-400 animate-bounce" />}
                      <MicOff className="w-3.5 h-3.5 text-stone-500" />
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        )}

      </div>

      {/* 4. ZOOM BOTTOM MAIN CONTROL TOOLBAR (AUTHENTIC CONFERENCE TOOLBAR) */}
      <div className="p-3 sm:p-4 rounded-2xl bg-gradient-to-r from-stone-950 via-stone-900 to-stone-950 border-2 border-amber-800/40 shadow-2xl flex flex-wrap items-center justify-between gap-3">
        
        {/* Left Controls: Audio & Video Toggles */}
        <div className="flex items-center gap-2">
          {/* Microphone Mute/Unmute */}
          <button
            onClick={handleToggleMic}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold border transition shadow-lg ${
              isMicOn
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 animate-pulse'
                : 'bg-stone-900 hover:bg-stone-800 text-red-300 border-red-800/60'
            }`}
          >
            {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4 text-red-400" />}
            <span className="hidden sm:inline">{isMicOn ? 'ማይክ ክፍት ነው' : 'ማይክ ክፈት'}</span>
          </button>

          {/* Camera Start/Stop */}
          <button
            onClick={handleToggleVideo}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold border transition shadow-lg ${
              isVideoOn
                ? 'bg-stone-900 hover:bg-stone-800 text-stone-200 border-stone-700'
                : 'bg-red-950/80 hover:bg-red-900 text-red-200 border-red-700'
            }`}
          >
            {isVideoOn ? <Video className="w-4 h-4 text-emerald-400" /> : <VideoOff className="w-4 h-4 text-red-400" />}
            <span className="hidden sm:inline">{isVideoOn ? 'ካሜራ በርቷል' : 'ካሜራ ክፈት'}</span>
          </button>
        </div>

        {/* Center Controls: Interactive Discussion & Feedback Tools */}
        <div className="flex items-center gap-2">
          {/* Raise Hand (ሀሳብ አለኝ / ጥያቄ አለኝ) */}
          <button
            onClick={handleToggleHand}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition shadow-lg ${
              isHandRaised
                ? 'bg-amber-500 hover:bg-amber-400 text-stone-950 border-amber-300 shadow-amber-500/20 animate-bounce'
                : 'bg-stone-900 hover:bg-stone-800 text-amber-200 border-amber-700/60'
            }`}
          >
            <Hand className="w-4 h-4" />
            <span>{isHandRaised ? 'እጅ ወጥቷል (ሀሳብ አለኝ)' : 'እጅ አውጣ (ሀሳብ ስጥ)'}</span>
          </button>

          {/* Screen Share */}
          <button
            onClick={handleToggleScreenShare}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium border transition ${
              isScreenSharing
                ? 'bg-emerald-950 text-emerald-200 border-emerald-500 font-bold'
                : 'bg-stone-900 hover:bg-stone-800 text-stone-300 border-stone-700'
            }`}
            title="ስክሪን አጋራ (Share Screen)"
          >
            <Share2 className="w-4 h-4 text-amber-400" />
            <span className="hidden md:inline">ስክሪን አጋራ</span>
          </button>

          {/* Floating Reactions Trigger */}
          <div className="relative">
            <button
              onClick={() => setShowReactionsMenu(!showReactionsMenu)}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-amber-200 border border-stone-700 text-xs font-medium transition"
              title="ምላሾች (Reactions)"
            >
              <Smile className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">ምላሾች</span>
            </button>

            {showReactionsMenu && (
              <div className="absolute bottom-12 left-1/2 -translate-x-1/2 p-2 bg-stone-950 border border-amber-700/60 rounded-2xl shadow-2xl flex items-center gap-2 z-50 animate-fade-in">
                {[
                  { emoji: '🙏', label: 'አሜን' },
                  { emoji: '✝️', label: 'በረከት' },
                  { emoji: '❤️', label: 'ፍቅር' },
                  { emoji: '👏', label: 'እልልታ' },
                  { emoji: '💡', label: 'ጥያቄ' },
                ].map((item) => (
                  <button
                    key={item.emoji}
                    onClick={() => handleSendReaction(item.emoji)}
                    className="p-2 hover:bg-stone-900 rounded-xl transition text-2xl"
                    title={item.label}
                  >
                    {item.emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Begena / Sacred Hymn Audio Player */}
          <button
            onClick={() => {
              toggleSpiritualHymn((playing) => setAudioHymnPlaying(playing));
            }}
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-medium transition hidden lg:flex ${
              audioHymnPlaying
                ? 'bg-amber-950 border-amber-500 text-amber-200 font-bold animate-pulse'
                : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-amber-200'
            }`}
          >
            <Volume2 className="w-4 h-4 text-amber-400" />
            <span>{audioHymnPlaying ? 'የበገና ዜማ በርቷል' : 'የበገና ዜማ'}</span>
          </button>
        </div>

        {/* Right Controls: Chat, Participants, Leave Meeting */}
        <div className="flex items-center gap-2">
          {/* Chat Toggle Button */}
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

          {/* Participants Toggle Button */}
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

          {/* Leave Meeting Button */}
          <button
            onClick={() => {
              if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop());
              if (pcRef.current) pcRef.current.close();
              if (wsRef.current) wsRef.current.close();
              window.location.reload();
            }}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-red-950/80 hover:bg-red-900 border border-red-700/70 text-red-200 text-xs font-bold transition shadow"
            title="ከስብሰባው ውጣ"
          >
            <PhoneOff className="w-4 h-4 text-red-300" />
            <span className="hidden sm:inline">ውጣ</span>
          </button>
        </div>

      </div>

    </div>
  );
};

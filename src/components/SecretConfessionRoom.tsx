import React, { useState, useRef, useEffect } from 'react';
import { Shield, Lock, Video, VideoOff, Mic, MicOff, PhoneOff, Check, Sparkles, KeyRound, Flame, Volume2, RefreshCw, Maximize2, Minimize2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { UserProfile, ConfessionBooking } from '../types';
import { fetchWebRTCConfig, verifySecretRoomPasscode, getRealtimeWsUrl } from '../services/api';
import { playChurchBell, speakBlessingPrayer } from '../utils/audio';
import sacredSanctuaryImg from '../assets/images/sacred_confession_sanctuary_1794468348510.jpg';

interface SecretConfessionRoomProps {
  user: UserProfile;
  bookings: ConfessionBooking[];
  onCompleteConfession: (bookingId: string) => void;
}

export const SecretConfessionRoom: React.FC<SecretConfessionRoomProps> = ({
  user,
  bookings,
  onCompleteConfession,
}) => {
  const [passcode, setPasscode] = useState('');
  const [roomId, setRoomId] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Real MediaStream & Audio Meters
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [micVolumeLevel, setMicVolumeLevel] = useState(0);

  // Real WebRTC & Peer State
  const [remoteUserConnected, setRemoteUserConnected] = useState(false);
  const [remoteUserName, setRemoteUserName] = useState<string>('');
  const [iceState, setIceState] = useState<string>('waiting');
  const [isVideoFullscreen, setIsVideoFullscreen] = useState(false);
  const [swapVideoFeed, setSwapVideoFeed] = useState(false);
  const [mediaPermissionMsg, setMediaPermissionMsg] = useState<string | null>(null);
  const [requestingMedia, setRequestingMedia] = useState(false);

  // Confession Ritual Steps (1: ጸሎት, 2: መናዘዝ, 3: ቀኖና, 4: ፍትሐት)
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1);
  const [confessionNotes, setConfessionNotes] = useState('');
  const [isBlessed, setIsBlessed] = useState(false);
  const [penancePrescription, setPenancePrescription] = useState('40 ጊዜ አቡነ ዘበሰማያት፣ ጾም በጸሎት፣ ከቂምና ቁጣ መራቅ');

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const videoBoxRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const iceCandidatesQueue = useRef<RTCIceCandidateInit[]>([]);
  const remotePeerIdRef = useRef<string | null>(null);
  const isMicOnRef = useRef(isMicOn);
  isMicOnRef.current = isMicOn;

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        setIsVideoFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
      remoteVideoRef.current.play().catch(() => {});
    }
    if (localVideoRef.current && streamRef.current) {
      localVideoRef.current.srcObject = streamRef.current;
      localVideoRef.current.play().catch(() => {});
    }
  }, [remoteUserConnected, swapVideoFeed, isVideoOn]);

  useEffect(() => {
    if (!isAuthenticated || !roomId) return;
    let isCancelled = false;

    const createPC = (rtcConfig: RTCConfiguration, ws: WebSocket, targetPeerId: string | null) => {
      if (pcRef.current) {
        pcRef.current.close();
      }
      const pc = new RTCPeerConnection(rtcConfig);
      pcRef.current = pc;

      const applyEncoderParams = (conn: RTCPeerConnection) => {
        try {
          conn.getSenders().forEach((sender) => {
            if (!sender.track) return;
            const params = sender.getParameters();
            if (!params.encodings || params.encodings.length === 0) {
              params.encodings = [{}];
            }
            if (sender.track.kind === 'video') {
              params.encodings[0].maxBitrate = 2_500_000;
              params.encodings[0].maxFramerate = 30;
              (params as any).degradationPreference = 'maintain-resolution';
            } else if (sender.track.kind === 'audio') {
              params.encodings[0].maxBitrate = 96_000;
            }
            sender.setParameters(params).catch(() => {});
          });
        } catch {}
      };

      const stream = streamRef.current;
      if (stream && stream.getTracks().length > 0) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        if (stream.getVideoTracks().length === 0) {
          pc.addTransceiver('video', { direction: 'recvonly' });
        }
        if (stream.getAudioTracks().length === 0) {
          pc.addTransceiver('audio', { direction: 'recvonly' });
        }
        applyEncoderParams(pc);
      } else {
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });
      }

      pc.ontrack = (event) => {
        const remStream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
        remoteStreamRef.current = remStream;
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remStream;
          remoteVideoRef.current.play().catch(() => {});
        }
        setRemoteUserConnected(true);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'webrtc-signal',
              roomId,
              targetPeerId: remotePeerIdRef.current || targetPeerId,
              signal: { candidate: event.candidate },
            })
          );
        }
      };

      pc.oniceconnectionstatechange = () => {
        setIceState(pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed') {
          try {
            pc.restartIce();
          } catch {}
        }
      };

      return pc;
    };

    const flushIce = async (pc: RTCPeerConnection) => {
      const q = iceCandidatesQueue.current;
      iceCandidatesQueue.current = [];
      for (const c of q) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(c));
        } catch {}
      }
    };

    const bootSecretCall = async () => {
      const rtcConfig = await fetchWebRTCConfig();

      let stream: MediaStream | null = null;
      if (navigator.mediaDevices?.getUserMedia) {
        const hdAudio: MediaTrackConstraints = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
        };
        const candidates: MediaStreamConstraints[] = [
          {
            video: { facingMode: 'user', width: { ideal: 1920, min: 640 }, height: { ideal: 1080, min: 480 }, frameRate: { ideal: 30 } },
            audio: hdAudio,
          },
          { video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } },
          { video: { facingMode: 'user' }, audio: true },
          { video: true, audio: true },
          { video: true },
          { audio: true },
        ];
        for (const c of candidates) {
          try {
            stream = await navigator.mediaDevices.getUserMedia(c);
            break;
          } catch {}
        }
      }

      if (isCancelled) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }

      if (stream) {
        streamRef.current = stream;
        const hasVideo = stream.getVideoTracks().length > 0;
        const hasAudio = stream.getAudioTracks().length > 0;
        setIsVideoOn(hasVideo);
        setIsMicOn(hasAudio);
        setMediaPermissionMsg(hasVideo ? null : 'ካሜራው አልተፈቀደም፤ ከታች «ካሜራ ፍቀድ» የሚለውን ይንኩ።');
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play().catch(() => {});
        }

        if (hasAudio) {
          try {
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
              if (isCancelled) return;
              if (analyserRef.current && isMicOnRef.current) {
                analyserRef.current.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                setMicVolumeLevel(Math.min(100, Math.round((sum / dataArray.length / 128) * 100)));
              } else {
                setMicVolumeLevel(0);
              }
              animationFrameRef.current = requestAnimationFrame(updateVolume);
            };
            updateVolume();
          } catch {}
        }
      } else {
        setIsVideoOn(false);
        setIsMicOn(false);
        setMediaPermissionMsg('የቪዲዮ ካሜራ ፍቃድ አልተሰጠም፤ «ካሜራና ማይክ ፍቀድ» የሚለውን ይጫኑ።');
      }

      const ws = new WebSocket(getRealtimeWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'join-room',
            roomId,
            userId: user.id || `secret-${Math.random().toString(36).slice(2, 8)}`,
            userName: user.fullName,
            baptismalName: user.baptismalName || user.fullName,
            role: user.role === 'priest' ? 'priest' : 'child',
            isMicOn: true,
            isVideoOn: Boolean(stream?.getVideoTracks().length),
          })
        );
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'room-state' && Array.isArray(data.existingPeers) && data.existingPeers.length > 0) {
            const target = data.existingPeers[0];
            remotePeerIdRef.current = target.peerId;
            setRemoteUserName(target.baptismalName || target.userName);
            const pc = createPC(rtcConfig, ws, target.peerId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            ws.send(
              JSON.stringify({
                type: 'webrtc-signal',
                roomId,
                targetPeerId: target.peerId,
                signal: { sdp: offer },
              })
            );
          } else if (data.type === 'peer-joined' && data.peer) {
            remotePeerIdRef.current = data.peer.peerId;
            setRemoteUserName(data.peer.baptismalName || data.peer.userName);
          } else if (data.type === 'webrtc-signal' && data.signal) {
            if (data.senderPeerId) {
              remotePeerIdRef.current = data.senderPeerId;
            }
            if (data.senderName) {
              setRemoteUserName(data.senderName);
            }

            let pc = pcRef.current;
            if (!pc) {
              pc = createPC(rtcConfig, ws, data.senderPeerId || null);
            }

            const { signal } = data;
            if (signal.sdp) {
              await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
              await flushIce(pc);
              if (signal.sdp.type === 'offer') {
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                ws.send(
                  JSON.stringify({
                    type: 'webrtc-signal',
                    roomId,
                    targetPeerId: data.senderPeerId,
                    signal: { sdp: answer },
                  })
                );
              }
            } else if (signal.candidate) {
              if (pc.remoteDescription && pc.remoteDescription.type) {
                await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
              } else {
                iceCandidatesQueue.current.push(signal.candidate);
              }
            }
          } else if (data.type === 'peer-left') {
            setRemoteUserConnected(false);
            setRemoteUserName('');
            remotePeerIdRef.current = null;
            remoteStreamRef.current = null;
            if (pcRef.current) {
              pcRef.current.close();
              pcRef.current = null;
            }
          }
        } catch (err) {
          console.warn('Secret room signaling error:', err);
        }
      };
    };

    bootSecretCall();

    return () => {
      isCancelled = true;
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'leave-room' }));
        wsRef.current.close();
      }
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isAuthenticated, roomId, user.id, user.fullName, user.baptismalName, user.role]);

  const handleRequestSecretMedia = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaPermissionMsg('ካሜራ ለመክፈት HTTPS ደህንነቱ የተጠበቀ ግንኙነት ያስፈልጋል።');
      return;
    }
    setRequestingMedia(true);
    try {
      const candidates: MediaStreamConstraints[] = [
        { video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true },
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
        if (lastErr?.name === 'NotAllowedError' || lastErr?.name === 'PermissionDeniedError') {
          setMediaPermissionMsg('የብራውዘር ካሜራ ፍቃድ ተከልክሏል። ከላይ 🔒 (Settings) ላይ Camera → Allow ያድርጉ።');
        } else {
          setMediaPermissionMsg('ካሜራ መክፈት አልተቻለም፤ ካሜራው በሌላ መተግበሪያ ክፍት አለመሆኑን ያረጋግጡ።');
        }
        return;
      }

      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }
      setIsVideoOn(stream.getVideoTracks().length > 0);
      setIsMicOn(stream.getAudioTracks().length > 0);
      setMediaPermissionMsg(null);

      if (pcRef.current) {
        for (const track of stream.getTracks()) {
          const sender = pcRef.current.getSenders().find((s) => s.track?.kind === track.kind);
          if (sender) {
            await sender.replaceTrack(track).catch(() => {});
          } else {
            pcRef.current.addTrack(track, stream);
          }
        }
        try {
          const offer = await pcRef.current.createOffer();
          await pcRef.current.setLocalDescription(offer);
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: 'webrtc-signal',
                roomId,
                targetPeerId: remotePeerIdRef.current,
                signal: { sdp: offer },
              })
            );
          }
        } catch {}
      }
    } finally {
      setRequestingMedia(false);
    }
  };

  // Toggle Video Track (auto-requests camera permission if none active)
  const handleToggleVideo = async () => {
    const tracks = streamRef.current?.getVideoTracks() || [];
    if (tracks.length === 0) {
      await handleRequestSecretMedia();
      return;
    }
    const newState = !isVideoOn;
    setIsVideoOn(newState);
    tracks.forEach((track) => {
      track.enabled = newState;
    });
  };

  // Toggle Audio Track
  const handleToggleMic = async () => {
    const tracks = streamRef.current?.getAudioTracks() || [];
    if (tracks.length === 0) {
      await handleRequestSecretMedia();
      return;
    }
    const newState = !isMicOn;
    setIsMicOn(newState);
    tracks.forEach((track) => {
      track.enabled = newState;
    });
    if (!newState) setMicVolumeLevel(0);
  };

  // Seamless HD camera flip without tearing down call
  const handleSwitchCamera = async () => {
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    try {
      const newCamStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: nextFacing,
          width: { ideal: 1920, min: 640 },
          height: { ideal: 1080, min: 480 },
          frameRate: { ideal: 30 },
        },
      });
      const newTrack = newCamStream.getVideoTracks()[0];
      const oldTrack = streamRef.current?.getVideoTracks()[0];
      if (streamRef.current && newTrack) {
        if (oldTrack) {
          streamRef.current.removeTrack(oldTrack);
          oldTrack.stop();
        }
        streamRef.current.addTrack(newTrack);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = streamRef.current;
        }
        const sender = pcRef.current?.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(newTrack).catch(() => {});
        }
        setFacingMode(nextFacing);
      }
    } catch {
      alert('ካሜራ መቀየር አልተቻለም።');
    }
  };

  const handleToggleFullscreen = async () => {
    const next = !isVideoFullscreen;
    setIsVideoFullscreen(next);
    const el = videoBoxRef.current;
    try {
      if (next && el?.requestFullscreen) {
        await el.requestFullscreen();
      } else if (!next && document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // Fixed CSS full-viewport fallback handles iOS Safari gracefully
    }
  };

  const handleUnlockRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      const result = await verifySecretRoomPasscode(passcode);
      if (result.authorized && result.roomId) {
        setRoomId(result.roomId);
        setIsAuthenticated(true);
        playChurchBell();
      } else {
        setErrorMsg(result.error || 'የተሳሳተ የሚስጥር ቁጥር! ቢያንስ 3 አሃዝ የጋራ ሚስጥር ኮድ ያስገቡ።');
      }
    } catch {
      setErrorMsg('ከሰርቨር ጋር መገናኘት አልተቻለም።');
    }
  };

  const handleGrantAbsolution = () => {
    setIsBlessed(true);
    playChurchBell();
    speakBlessingPrayer(
      `በስመ አብ ወወልድ ወመንፈስ ቅዱስ አሐዱ አምላክ አሜን። ልጄ ${user.baptismalName || ''}፣ እግዚአብሔር አምላክ ኃጢአትህን ይደምስስልህ። በሰላም ሂድ፤ በረከቱ ይደርብህ!`
    );

    try {
      confetti({
        particleCount: 140,
        spread: 85,
        origin: { y: 0.6 },
        colors: ['#FFE885', '#D4AF37', '#800020', '#FFFFFF', '#10B981'],
      });
    } catch {}

    if (bookings.length > 0) {
      onCompleteConfession(bookings[0].id);
    }
  };

  const handleBurnConfessionNotes = () => {
    setConfessionNotes('');
    alert('የተናዘዙት ማስታወሻ በእሳት እንደተቃጠለ በንስሐ አባትዎ ፊት ተሰርዟል፤ በምስጢር ተደምስሷል!');
  };

  // Locked Gate Screen
  if (!isAuthenticated) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-b from-stone-900 via-stone-950 to-black border-2 border-red-900/50 shadow-2xl text-center space-y-6 relative overflow-hidden">
          
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-red-950/30 rounded-full blur-3xl pointer-events-none" />

          <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-red-950 to-stone-900 border-2 border-amber-600/60 flex items-center justify-center text-amber-400 shadow-xl">
            <Lock className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl font-heading font-bold text-amber-100">
              የንስሐ አባትና ልጅ ብቻ የሚስጥር ቤት
            </h2>
          </div>

          <div className="p-4 rounded-xl bg-stone-950/80 border border-amber-900/40 text-xs text-amber-200/90 max-w-md mx-auto space-y-1">
            <div className="flex items-center justify-center gap-1.5 font-semibold text-amber-300">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>የቀኖና እና የመጽሐፈ ንስሐ ጥብቅ ሚስጥር (WebRTC P2P Encrypted)</span>
            </div>
          </div>

          <form onSubmit={handleUnlockRoom} className="max-w-xs mx-auto space-y-4 pt-2">
            <div className="relative">
              <KeyRound className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-400" />
              <input
                type="password"
                maxLength={8}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="የጋራ የሚስጥር ቁጥርዎን ያስገቡ"
                className="w-full bg-stone-900 border border-amber-700/60 rounded-xl pl-11 pr-4 py-3 text-center text-lg font-mono tracking-widest text-amber-200 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {errorMsg && (
              <p className="text-xs text-red-400 bg-red-950/40 p-2 rounded-lg border border-red-800/40">
                {errorMsg}
              </p>
            )}

            <button
              type="submit"
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-red-900 via-amber-900 to-red-900 border border-amber-500/50 text-white font-bold text-sm hover:from-red-800 hover:to-amber-800 shadow-xl transition-all hover:scale-[1.01]"
            >
              በበረከት ወደ ሚስጥር ቤቱ ግባ
            </button>
          </form>

        </div>
      </div>
    );
  }

  // Active Inside Sanctuary Screen
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      
      {/* Top Security Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl bg-stone-950 border border-red-900/40">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-lg bg-red-950/80 text-red-400 shrink-0">
            <Shield className="w-5 h-5 text-emerald-400" />
          </div>
          <h3 className="text-sm font-bold font-heading text-amber-200 truncate">
            የንስሐ ሚስጥር ቤት — የቀሲስ ሄኖክ እና የ{user.baptismalName} 1-ለ-1 ቪዲዮ
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Real Audio Volume Visualizer Meter */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-800 text-xs shrink-0">
            <Volume2 className="w-3.5 h-3.5 text-amber-400" />
            <div className="w-14 h-2 bg-stone-950 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-all duration-75"
                style={{ width: `${micVolumeLevel}%` }}
              />
            </div>
            <span className="font-mono text-stone-300 text-xs">{micVolumeLevel}%</span>
          </div>

          {/* Real Peer-to-Peer Connection Status */}
          <span className={`px-2.5 py-1.5 rounded-lg border text-xs flex items-center gap-1.5 ${
            remoteUserConnected
              ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200'
              : 'bg-amber-950/60 border-amber-700/50 text-amber-200'
          }`}>
            <span className={`w-2 h-2 rounded-full shrink-0 ${remoteUserConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span>
              {remoteUserConnected
                ? `ቀጥታ ከ${remoteUserName} ጋር ተገናኝቷል`
                : 'ሌላኛውን ሰው በመጠባበቅ ላይ...'}
            </span>
          </span>

          <button
            onClick={() => {
              if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
              if (pcRef.current) pcRef.current.close();
              if (wsRef.current) wsRef.current.close();
              setIsAuthenticated(false);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-950/80 border border-red-700/70 text-red-200 text-xs hover:bg-red-900 transition shrink-0"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            <span>ከቤቱ ውጣ</span>
          </button>
        </div>
      </div>

      {/* Video & Ritual Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: Unobstructed 1-on-1 Real HD Video Interface */}
        <div className="lg:col-span-7 space-y-3">
          
          <div
            ref={videoBoxRef}
            className={`overflow-hidden bg-black border-2 border-amber-700/50 shadow-2xl ${
              isVideoFullscreen
                ? 'fixed inset-0 z-50 h-screen w-screen rounded-none'
                : 'relative rounded-2xl h-[460px] sm:h-[580px]'
            }`}
          >
            {/* Remote Video Layer (Main stage when connected and not swapped; PiP when swapped) */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              onClick={() => {
                if (remoteUserConnected && swapVideoFeed) setSwapVideoFeed(false);
              }}
              className={`object-cover contrast-[1.03] saturate-[1.06] ${
                !remoteUserConnected
                  ? 'hidden'
                  : swapVideoFeed
                  ? 'absolute bottom-3 right-3 w-32 sm:w-44 h-44 sm:h-52 rounded-2xl border-2 border-amber-400 shadow-2xl z-20 cursor-pointer'
                  : 'w-full h-full block'
              }`}
            />

            {/* Self Video Layer (Full clear main view while waiting OR when swapped; generous unobstructed PiP when remote is main) */}
            {isVideoOn ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                onClick={() => {
                  if (remoteUserConnected && !swapVideoFeed) setSwapVideoFeed(true);
                }}
                className={`object-cover contrast-[1.03] saturate-[1.05] mirror ${
                  !remoteUserConnected || swapVideoFeed
                    ? 'w-full h-full block'
                    : 'absolute bottom-3 right-3 w-32 sm:w-44 h-44 sm:h-52 rounded-2xl border-2 border-amber-400/90 shadow-2xl z-20 cursor-pointer'
                }`}
              />
            ) : !remoteUserConnected ? (
              <div className="relative w-full h-full">
                <img
                  src={sacredSanctuaryImg}
                  alt="የንስሐ ሚስጥር ቤት"
                  decoding="async"
                  className="w-full h-full object-cover filter brightness-50"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-3">
                  <Lock className="w-10 h-10 text-amber-400" />
                  <p className="text-sm font-heading font-bold text-amber-100">
                    የንስሐ ሚስጥር ቤት ክፍት ነው
                  </p>
                  <button
                    type="button"
                    onClick={handleToggleVideo}
                    disabled={requestingMedia}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-400 text-white text-xs font-extrabold inline-flex items-center gap-2 shadow-lg transition"
                  >
                    <Video className="w-4 h-4" />
                    <span>{requestingMedia ? 'በመክፈት ላይ...' : 'ካሜራ ክፈት / ፍቀድ'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="absolute bottom-3 right-3 w-32 sm:w-44 h-44 sm:h-52 rounded-2xl border-2 border-amber-400/70 bg-stone-950/95 z-20 flex flex-col items-center justify-center p-3 text-center gap-2 shadow-2xl">
                <VideoOff className="w-6 h-6 text-red-400" />
                <button
                  type="button"
                  onClick={handleToggleVideo}
                  disabled={requestingMedia}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold transition"
                >
                  {requestingMedia ? 'በመክፈት ላይ...' : 'ካሜራ ፍቀድ'}
                </button>
              </div>
            )}

            {/* Main View Top-Left Live Badge */}
            <div className="absolute top-3 left-3 bg-stone-950/85 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-amber-700/50 text-xs font-bold text-amber-200 flex items-center gap-1.5 z-10">
              <span className={`w-2 h-2 rounded-full ${remoteUserConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-pulse'}`} />
              <span>
                {!remoteUserConnected
                  ? `${user.baptismalName || user.fullName} (ካሜራዎ ዝግጁ ነው · በመጠባበቅ ላይ)`
                  : swapVideoFeed
                  ? `${user.baptismalName || user.fullName} (እኔ)`
                  : `${remoteUserName} (በቀጥታ HD ቪዲዮ)`}
              </span>
            </div>

            {/* Fullscreen & Swap Controls Top-Right */}
            <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
              {remoteUserConnected && (
                <button
                  type="button"
                  onClick={() => setSwapVideoFeed((v) => !v)}
                  className="px-2.5 py-2 rounded-lg bg-stone-950/85 hover:bg-amber-900 border border-amber-600/50 text-amber-200 transition text-xs font-bold"
                  title="ዋናውንና የራስዎን ቪዲዮ አቀያይር"
                >
                  አቀያይር
                </button>
              )}
              <button
                type="button"
                onClick={handleToggleFullscreen}
                className="p-2 rounded-lg bg-stone-950/85 hover:bg-amber-900 border border-amber-600/50 text-amber-200 transition flex items-center gap-1.5 text-xs font-bold"
                title={isVideoFullscreen ? 'ሙሉ ስክሪን ዝጋ' : 'ሙሉ ስክሪን ክፈት'}
              >
                {isVideoFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                <span className="hidden sm:inline">{isVideoFullscreen ? 'መደበኛ' : 'ሙሉ ስክሪን'}</span>
              </button>
            </div>

            {/* PiP Corner Name Pill (only when remote connected and inset visible) */}
            {remoteUserConnected && isVideoOn && (
              <div className="absolute bottom-4 right-4 z-30 bg-stone-950/85 px-2.5 py-0.5 rounded-md border border-amber-700/40 text-[10px] text-amber-200 pointer-events-none">
                {swapVideoFeed ? remoteUserName : `${user.baptismalName || user.fullName} (እኔ)`}
              </div>
            )}

            {/* Radiant Blessing Overlay when Priest Absolves */}
            {isBlessed && (
              <div className="absolute inset-0 bg-amber-500/20 backdrop-blur-[2px] flex flex-col items-center justify-center p-6 text-center animate-fade-in z-20">
                <div className="w-24 h-24 rounded-full bg-amber-400/25 border-2 border-amber-300 flex items-center justify-center text-amber-200 glow-gold mb-3">
                  <Sparkles className="w-12 h-12" />
                </div>
                <h4 className="text-2xl font-heading font-bold text-amber-100">
                  "እግዚአብሔር ይፍታህ፤ ኃጢአትህን ይደምስስልህ!"
                </h4>
              </div>
            )}

            {mediaPermissionMsg && (
              <div className="absolute top-14 left-3 right-3 z-20 p-2.5 rounded-xl bg-amber-950/90 border border-amber-500/70 text-xs text-amber-100 font-bold flex flex-wrap items-center justify-between gap-2 shadow-xl">
                <span>{mediaPermissionMsg}</span>
                <button
                  type="button"
                  onClick={handleRequestSecretMedia}
                  disabled={requestingMedia}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold"
                >
                  {requestingMedia ? 'በመክፈት ላይ...' : 'ካሜራና ማይክ ፍቀድ'}
                </button>
              </div>
            )}
          </div>

          {/* Clean Controls Bar Placed Below the Video Frame (Zero Face Overlap!) */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-stone-950 border border-amber-900/40 shadow-lg">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleToggleMic}
                className={`p-2.5 rounded-xl border transition flex items-center gap-1.5 text-xs ${
                  isMicOn ? 'bg-emerald-950 border-emerald-600 text-emerald-300' : 'bg-red-950 border-red-700 text-red-300'
                }`}
                title={isMicOn ? 'ማይክ ክፍት ነው' : 'ማይክ ዝጋ'}
              >
                {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                <span className="hidden sm:inline">{isMicOn ? 'ማይክ ክፍት' : 'ማይክ ዝግ'}</span>
              </button>

              <button
                onClick={handleToggleVideo}
                className={`p-2.5 rounded-xl border transition flex items-center gap-1.5 text-xs ${
                  isVideoOn ? 'bg-stone-900 border-stone-700 text-stone-200' : 'bg-red-950 border-red-700 text-red-300'
                }`}
                title={isVideoOn ? 'ካሜራ ክፍት ነው' : 'ካሜራ ዝጋ'}
              >
                {isVideoOn ? <Video className="w-4 h-4 text-emerald-400" /> : <VideoOff className="w-4 h-4" />}
                <span className="hidden sm:inline">{isVideoOn ? 'ካሜራ ክፍት' : 'ካሜራ ዝግ'}</span>
              </button>

              <button
                onClick={handleSwitchCamera}
                className="p-2.5 rounded-xl bg-stone-900 border border-stone-700 text-stone-300 hover:text-amber-200 transition"
                title="ካሜራ ቀይር (Flip Camera)"
              >
                <RefreshCw className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  speakBlessingPrayer('በእግዚአብሔር ስም ሰላም ለእናንተ ይሁን። ልጄ ኃጢአትህን ያለመደበቅ ተናዘዝ፤ እግዚአብሔር መሐሪና ይቅር ባይ ነው።');
                }}
                className="px-3 py-2 rounded-xl bg-stone-900 border border-stone-700 text-xs text-amber-300 hover:bg-stone-800 transition flex items-center gap-1.5"
              >
                <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                <span>ቀሲሱን አድምጥ</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-stone-300">
              <Flame className="w-4 h-4 text-amber-400 animate-candle" />
              <span className="hidden sm:inline">የንስሐ ጧፍ በርቷል</span>
            </div>
          </div>

        </div>

        {/* Right: Canonical Confession Ritual Step-by-Step */}
        <div className="lg:col-span-5 flex flex-col h-[520px] rounded-2xl bg-stone-900/60 border border-amber-900/40 p-5 space-y-4 overflow-y-auto">
          
          <div className="border-b border-stone-800 pb-3">
            <h3 className="text-base font-semibold font-heading text-amber-200">
              የንስሐ አቀባበልና ሥርዓት (4ቱ ደረጃዎች)
            </h3>
          </div>

          {/* Stepper Tabs */}
          <div className="grid grid-cols-4 gap-1.5 p-1 bg-stone-950 rounded-xl border border-stone-800">
            {[
              { num: 1, label: 'ጸሎት' },
              { num: 2, label: 'መናዘዝ' },
              { num: 3, label: 'ቀኖና' },
              { num: 4, label: 'ፍትሐት' },
            ].map((s) => (
              <button
                key={s.num}
                onClick={() => setActiveStep(s.num as any)}
                className={`py-1.5 rounded-lg text-xs font-medium transition ${
                  activeStep === s.num
                    ? 'bg-amber-900/70 text-amber-200 font-bold border border-amber-600/50'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                {s.num}. {s.label}
              </button>
            ))}
          </div>

          {/* Step 1: ጸሎተ ንስሐ */}
          {activeStep === 1 && (
            <div className="space-y-3 animate-fade-in">
              <div className="p-3.5 rounded-xl bg-stone-950/80 border border-stone-800 text-xs space-y-2">
                <p className="font-semibold text-amber-300">ደረጃ ፩፡ የንስሐ መጀመሪያ ጸሎት</p>
                <p className="text-stone-300 leading-relaxed font-serif">
                  "አቤቱ አምላኬ ሆይ፥ በሰማይና በምድር ፊት በደልሁ፤ በፊትህም ክፉ ሥራን አደረግሁ። እንደ ምሕረትህ ብዛት ይቅር በለኝ፤ በደሌንም አታስብብኝ። 
                  በካህኑ በቀሲስ ሄኖክ ፊት ኃጢአቴን እናዘዛለሁ፤ ይቅርታህን እሻለሁ።"
                </p>
              </div>
              <button
                onClick={() => setActiveStep(2)}
                className="w-full py-2.5 rounded-xl bg-amber-900/60 hover:bg-amber-900 border border-amber-600/50 text-amber-200 text-xs font-semibold transition"
              >
                ወደ መናዘዝ ሂድ (ደረጃ ፪) →
              </button>
            </div>
          )}

          {/* Step 2: ኃጢአትን መናዘዝ */}
          {activeStep === 2 && (
            <div className="space-y-3 animate-fade-in flex-1 flex flex-col">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-amber-300">ደረጃ ፪፡ ኃጢአትን መናዘዝ</span>
                <span className="text-[10px] text-red-400">ሳይቀመጥ የሚቃጠል</span>
              </div>
              <textarea
                value={confessionNotes}
                onChange={(e) => setConfessionNotes(e.target.value)}
                placeholder="ኃጢአትህን እዚህ በግልጽ ጻፍ (የልብህን ሸክም እዚህ አውርደው)..."
                rows={5}
                className="w-full bg-stone-950 border border-stone-700 rounded-xl p-3 text-xs text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleBurnConfessionNotes}
                  className="flex-1 py-2 rounded-xl bg-red-950/60 hover:bg-red-900 border border-red-800 text-red-200 text-xs transition"
                >
                  ማስታወሻውን አቃጥል (ደምስስ)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStep(3)}
                  className="flex-1 py-2 rounded-xl bg-amber-900/60 hover:bg-amber-900 border border-amber-600 text-amber-200 text-xs transition"
                >
                  ቀኖና ተቀበል (ደረጃ ፫) →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: ቀኖና መቀበል */}
          {activeStep === 3 && (
            <div className="space-y-3 animate-fade-in">
              <div className="p-3.5 rounded-xl bg-stone-950/80 border border-stone-800 text-xs space-y-2">
                <p className="font-semibold text-amber-300">ደረጃ ፫፡ ከአባታችን የተሰጠ ቀኖና</p>
                <div className="p-2.5 rounded-lg bg-stone-900 border border-amber-900/40 text-amber-200 font-medium">
                  {penancePrescription}
                </div>
                <input
                  type="text"
                  value={penancePrescription}
                  onChange={(e) => setPenancePrescription(e.target.value)}
                  placeholder="ቀኖናውን ማስተካከል ከፈለጉ..."
                  className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2.5 py-1.5 text-xs text-stone-200"
                />
              </div>
              <button
                onClick={() => setActiveStep(4)}
                className="w-full py-2.5 rounded-xl bg-amber-900/60 hover:bg-amber-900 border border-amber-600/50 text-amber-200 text-xs font-semibold transition"
              >
                ወደ ፍትሐትና ቡራኬ ሂድ (ደረጃ ፬) →
              </button>
            </div>
          )}

          {/* Step 4: ፍትሐት እና የመስቀል ቡራኬ */}
          {activeStep === 4 && (
            <div className="space-y-4 animate-fade-in text-center p-3 rounded-xl bg-stone-950/80 border border-amber-800/40">
              <div className="w-14 h-14 mx-auto rounded-full bg-amber-950/80 border border-amber-500 flex items-center justify-center text-amber-300 glow-gold">
                <Sparkles className="w-7 h-7" />
              </div>
              <div>
                <h4 className="text-base font-heading font-bold text-amber-200">ደረጃ ፬፡ የፍትሐት ጸሎትና የመስቀል ቡራኬ</h4>
              </div>

              <button
                onClick={handleGrantAbsolution}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-900 via-amber-900 to-emerald-900 border border-amber-400 text-white font-bold text-xs shadow-lg hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>{isBlessed ? 'ቡራኬውን ተቀብለዋል (እግዚአብሔር ይፍታህ!)' : 'የመስቀል ቡራኬና የፍትሐት ጸሎት ተቀበል'}</span>
              </button>

              {isBlessed && (
                <div className="p-2.5 rounded-lg bg-emerald-950/50 border border-emerald-600/50 text-xs text-emerald-200 flex items-center justify-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>ንስሐዎ በክህነት ሥልጣን ተጠናቋል። በሰላም ሂዱ!</span>
                </div>
              )}
            </div>
          )}

        </div>

      </div>

    </div>
  );
};

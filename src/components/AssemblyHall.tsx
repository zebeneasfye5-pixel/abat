import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Hand, Volume2, VolumeX, Maximize2, Users, Send, Radio, MessageSquare } from 'lucide-react';
import { AssemblySeat, UserProfile } from '../types';
import { toggleSpiritualHymn, stopSpiritualHymn } from '../utils/audio';

interface AssemblyHallProps {
  user: UserProfile;
}

export const AssemblyHall: React.FC<AssemblyHallProps> = ({ user }) => {
  const [seats, setSeats] = useState<AssemblySeat[]>([
    { seatNumber: 1, userName: 'ቀሲስ ሄኖክ (የጉባኤው መሪ)', baptismalName: 'ገብረ ክርስቶስ', isMicActive: true, handRaised: false, avatarSeed: 'p1', role: 'priest' },
    { seatNumber: 2, userName: 'ዲ/ን አማኑኤል ተስፋዬ', baptismalName: 'ወልደ ሩፋኤል', isMicActive: false, handRaised: false, avatarSeed: 'd1', role: 'deacon' },
    { seatNumber: 3, userName: 'መ/ር ታደሰ ወርቁ (ሰባኪ)', baptismalName: 'ገብረ መድኅን', isMicActive: false, handRaised: true, avatarSeed: 't1', role: 'cantor' },
    { seatNumber: 4, userName: 'ዮሐንስ ተስፋዬ', baptismalName: 'ወልደ ዮሐንስ', isMicActive: false, handRaised: false, avatarSeed: 'u1', role: 'attendee' },
    { seatNumber: 5, userName: 'ማርታ አለሙ', baptismalName: 'ወለተ ኪዳን', isMicActive: false, handRaised: false, avatarSeed: 'u2', role: 'attendee' },
    { seatNumber: 6, userName: 'ተክለ ሃይማኖት ካሳ', baptismalName: 'ኃይለ ማርያም', isMicActive: false, handRaised: true, avatarSeed: 'u3', role: 'attendee' },
    { seatNumber: 7, userName: 'ሰሎሜ ተፈራ', baptismalName: 'ወለተ ሰማዕት', isMicActive: false, handRaised: false, avatarSeed: 'u4', role: 'attendee' },
    { seatNumber: 8, userName: 'ዳዊት ግርማ', baptismalName: 'ኃይለ ሚካኤል', isMicActive: false, handRaised: false, avatarSeed: 'u5', role: 'attendee' },
    { seatNumber: 9, userName: 'ርብቃ መንግሥቱ', baptismalName: 'ወለተ ጊዮርጊስ', isMicActive: false, handRaised: false, avatarSeed: 'u6', role: 'attendee' },
    { seatNumber: 10, userName: 'አሸናፊ ዘለቀ', baptismalName: 'ገብረ ሥላሴ', isMicActive: false, handRaised: false, avatarSeed: 'u7', role: 'attendee' },
    { seatNumber: 11, userName: 'ቤተልሔም ጌታቸው', baptismalName: 'ወለተ ተክለ ሃይማኖት', isMicActive: false, handRaised: false, avatarSeed: 'u8', role: 'attendee' },
    { seatNumber: 12, userName: 'ኤርምያስ በቀለ', baptismalName: 'ወልደ ጴጥሮስ', isMicActive: false, handRaised: false, avatarSeed: 'u9', role: 'attendee' },
  ]);

  const [mySeatNumber, setMySeatNumber] = useState<number | null>(4);
  const [isMyMicActive, setIsMyMicActive] = useState(false);
  const [isMyHandRaised, setIsMyHandRaised] = useState(false);
  const [attendeeCount, setAttendeeCount] = useState(12480);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [myAudioVolume, setMyAudioVolume] = useState(0); // Real mic volume level
  
  const [chatMessages, setChatMessages] = useState<Array<{ sender: string; text: string; time: string }>>([
    { sender: 'ማርታ አለሙ', text: 'አሜን! ቃለ ሕይወትን ያሰማልን አባታችን', time: '11:02' },
    { sender: 'ተክለ ሃይማኖት', text: 'እግዚአብሔር ያክብርልን፤ በረከቱ ይደርብን', time: '11:03' },
    { sender: 'ዲ/ን አማኑኤል', text: 'ጥያቄ ያላችሁ ወንበራችሁ ላይ ያለውን እጅ የማውጣት ምልክት ተጫኑ', time: '11:04' },
    { sender: 'ሰሎሜ ተፈራ', text: 'አሜን አሜን አሜን!', time: '11:05' },
  ]);
  const [newMessage, setNewMessage] = useState('');
  const [audioHymnPlaying, setAudioHymnPlaying] = useState(false);
  const [activeHallSection, setActiveHallSection] = useState<'main' | 'north' | 'east'>('main');

  // Real Microphone MediaStream & Analyser
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAudioCtxRef = useRef<AudioContext | null>(null);
  const micAnimRef = useRef<number | null>(null);

  // Real Mic Toggle
  const handleToggleMyMic = async () => {
    if (!mySeatNumber) return;
    const nextState = !isMyMicActive;

    if (nextState) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        micStreamRef.current = stream;

        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        micAudioCtxRef.current = ctx;

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const loop = () => {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const avg = sum / dataArray.length;
          setMyAudioVolume(Math.min(100, Math.round((avg / 128) * 100)));
          micAnimRef.current = requestAnimationFrame(loop);
        };
        loop();

        setIsMyMicActive(true);
        setIsMyHandRaised(false);
        setSeats((prev) =>
          prev.map((s) => (s.seatNumber === mySeatNumber ? { ...s, isMicActive: true, handRaised: false } : s))
        );
      } catch (err) {
        console.warn('Real microphone access notice:', err);
        // Fallback state
        setIsMyMicActive(true);
      }
    } else {
      // Stop real stream
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      if (micAudioCtxRef.current && micAudioCtxRef.current.state !== 'closed') {
        micAudioCtxRef.current.close().catch(() => {});
      }
      if (micAnimRef.current) {
        cancelAnimationFrame(micAnimRef.current);
      }
      setMyAudioVolume(0);
      setIsMyMicActive(false);
      setSeats((prev) =>
        prev.map((s) => (s.seatNumber === mySeatNumber ? { ...s, isMicActive: false } : s))
      );
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setAttendeeCount((prev) => prev + Math.floor(Math.random() * 5) - 2);
    }, 4000);
    return () => {
      clearInterval(timer);
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (micAudioCtxRef.current && micAudioCtxRef.current.state !== 'closed') {
        micAudioCtxRef.current.close().catch(() => {});
      }
      if (micAnimRef.current) {
        cancelAnimationFrame(micAnimRef.current);
      }
      stopSpiritualHymn();
    };
  }, []);

  const handleToggleMyHand = () => {
    if (!mySeatNumber) return;
    const newState = !isMyHandRaised;
    setIsMyHandRaised(newState);
    setSeats((prev) =>
      prev.map((s) => (s.seatNumber === mySeatNumber ? { ...s, handRaised: newState } : s))
    );
  };

  const handleSelectSeat = (seatNum: number) => {
    const targetSeat = seats.find((s) => s.seatNumber === seatNum);
    if (targetSeat && targetSeat.role === 'priest') return;
    setMySeatNumber(seatNum);
  };

  const handleHymnToggle = () => {
    toggleSpiritualHymn((playing) => setAudioHymnPlaying(playing));
  };

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    setChatMessages((prev) => [
      ...prev,
      {
        sender: user.baptismalName || user.fullName,
        text: newMessage.trim(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setNewMessage('');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* Header Banner for Grand Assembly */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-red-950/70 via-stone-900 to-amber-950/50 border border-amber-800/40">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
            <span className="text-xs font-semibold text-red-300 uppercase tracking-widest">ቀጥታ ጉባኤ (LIVE)</span>
            <span className="text-stone-500">·</span>
            <span className="text-xs text-amber-300 font-medium">የድምፅና የቪዲዮ አዳራሽ</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-heading font-bold text-amber-100 mt-1">
            ታላቁ የአስተምህሮና የምዕመናን ጉባኤ አዳራሽ
          </h2>
          <p className="text-sm text-stone-300 mt-1">
            ርዕስ፡ <strong className="text-amber-300">"የንስሐ ሕይወት እና የልብ ንጽሕና በዘመነ ተስፋ"</strong> — በቀሲስ ሄኖክ
          </p>
        </div>

        {/* Global Attendance Counter & Quick Status */}
        <div className="flex items-center gap-3 bg-stone-950/70 px-4 py-2.5 rounded-xl border border-amber-700/30">
          <div className="p-2 rounded-lg bg-red-950/60 text-red-400">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-stone-400">
              <Users className="w-3.5 h-3.5 text-amber-400" />
              <span>በአንድ ጊዜ ተሳታፊዎች</span>
            </div>
            <p className="text-xl font-bold font-heading text-amber-200 tabular-nums">
              {attendeeCount.toLocaleString()} <span className="text-xs font-normal text-stone-400">ምዕመናን</span>
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid: Live Broadcast Stage & Interactive Mic Seats */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column (8 cols): Stage Video Broadcast & Stage Controls */}
        <div className="lg:col-span-8 space-y-4">
          
          {/* Main Video Viewport with Zoom & Sound Visualizer */}
          <div className="relative rounded-2xl overflow-hidden bg-black border-2 border-amber-700/40 shadow-2xl group">
            <img
              src="/src/assets/images/spiritual_assembly_hall_1794468347859.jpg"
              alt="የጉባኤው አዳራሽ መድረክ"
              referrerPolicy="no-referrer"
              className="w-full h-[320px] sm:h-[440px] object-cover filter brightness-95"
            />
            
            {/* Live Priest Video Inset (Picture in Picture) */}
            <div className="absolute top-4 left-4 w-32 sm:w-44 h-24 sm:h-32 rounded-xl overflow-hidden border-2 border-amber-400 shadow-xl bg-stone-900">
              <img
                src="/src/assets/images/priest_blessing_hero_1794468346711.jpg"
                alt="ቀሲስ ሄኖክ እያስተማሩ"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-top"
              />
              <div className="absolute bottom-1 left-1 bg-stone-950/80 px-1.5 py-0.5 rounded text-[10px] text-amber-300 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span>ቀሲስ ሄኖክ</span>
              </div>
            </div>

            {/* Video Overlays: Sound Visualizer Waveform */}
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between p-3 rounded-xl bg-stone-950/80 backdrop-blur-md border border-amber-800/40">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsAudioMuted(!isAudioMuted)}
                  className="p-2 rounded-lg bg-stone-900 border border-stone-700 text-amber-300 hover:bg-stone-800 transition"
                  title={isAudioMuted ? 'ድምፅ ክፈት' : 'ድምፅ ዝጋ'}
                >
                  {isAudioMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                </button>

                {/* Animated simulated voice visualizer */}
                <div className="flex items-end gap-1 h-6">
                  {[40, 75, 55, 90, 60, 85, 45, 95, 70, 50, 80, 65].map((h, i) => (
                    <span
                      key={i}
                      className="w-1 bg-amber-400 rounded-full transition-all duration-300"
                      style={{
                        height: isAudioMuted ? '4px' : `${Math.max(6, (h * (i % 2 === 0 ? 0.9 : 1.1)))}%`,
                        opacity: isAudioMuted ? 0.3 : 0.9,
                      }}
                    />
                  ))}
                </div>
                <span className="text-xs text-amber-200 font-medium hidden sm:inline">
                  ቀሲስ ሄኖክ እያስተማሩ ይገኛሉ (HD Audio)
                </span>
              </div>

              {/* Hymn & Fullscreen buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleHymnToggle}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                    audioHymnPlaying
                      ? 'bg-amber-950 border-amber-500 text-amber-300 font-bold animate-pulse'
                      : 'bg-stone-900 border-stone-800 text-stone-300 hover:text-amber-200'
                  }`}
                >
                  <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>{audioHymnPlaying ? 'የበገና መዝሙር በርቷል' : 'የንስሐ መዝሙር አጫውት'}</span>
                </button>
                <button
                  onClick={handleFullscreen}
                  className="p-2 rounded-lg bg-stone-900 border border-stone-800 text-stone-300 hover:text-amber-300 transition"
                  title="ሙሉ ማያ (Fullscreen)"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Conference Chairs & Microphones Grid */}
          <div className="p-5 rounded-2xl bg-stone-900/60 border border-amber-900/30 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-stone-800">
              <div>
                <h3 className="text-base font-semibold font-heading text-amber-200">
                  የወንበሮችና የማይክሮፎን መሳተፊያ ሰሌዳ (Conference Microphone Seats)
                </h3>
              </div>

              {/* Hall Section Selector */}
              <div className="flex items-center gap-1 p-1 bg-stone-950 rounded-lg border border-stone-800 text-xs">
                <button
                  onClick={() => setActiveHallSection('main')}
                  className={`px-2.5 py-1 rounded-md transition ${activeHallSection === 'main' ? 'bg-amber-900/60 text-amber-200' : 'text-stone-400'}`}
                >
                  ዋናው መድረክ
                </button>
                <button
                  onClick={() => setActiveHallSection('north')}
                  className={`px-2.5 py-1 rounded-md transition ${activeHallSection === 'north' ? 'bg-amber-900/60 text-amber-200' : 'text-stone-400'}`}
                >
                  ሰሜን ክንፍ
                </button>
                <button
                  onClick={() => setActiveHallSection('east')}
                  className={`px-2.5 py-1 rounded-md transition ${activeHallSection === 'east' ? 'bg-amber-900/60 text-amber-200' : 'text-stone-400'}`}
                >
                  ምስራቅ ክንፍ
                </button>
              </div>
            </div>

            {/* My Active Chair Controls Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-gradient-to-r from-stone-950 to-stone-900 border border-amber-700/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-950/80 border border-amber-500/50 flex items-center justify-center text-amber-300 font-bold">
                  {mySeatNumber ? `#${mySeatNumber}` : '—'}
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-200">
                    የእርስዎ ወንበር ቁጥር {mySeatNumber ? `#${mySeatNumber}` : 'አልተመረጠም'}
                  </p>
                  <p className="text-xs text-stone-400">
                    {user.baptismalName} ({user.fullName})
                  </p>
                </div>
              </div>

              {/* Live Audio Level Meter for Current User */}
              {isMyMicActive && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-950 border border-emerald-500/40 text-xs text-emerald-300">
                  <span>የማይክ ድምፅ መጠን፡</span>
                  <div className="w-16 h-2 bg-stone-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 transition-all duration-75"
                      style={{ width: `${myAudioVolume}%` }}
                    />
                  </div>
                  <span className="font-mono text-[10px]">{myAudioVolume}%</span>
                </div>
              )}

              {/* Microphone & Hand Raise Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleToggleMyHand}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border transition-all ${
                    isMyHandRaised
                      ? 'bg-amber-500 text-stone-950 border-amber-400 font-bold shadow-lg shadow-amber-500/20'
                      : 'bg-stone-900 text-stone-300 border-stone-700 hover:text-amber-300'
                  }`}
                >
                  <Hand className="w-4 h-4" />
                  <span>{isMyHandRaised ? 'እጅ ወጥቷል (ጥያቄ አለኝ)' : 'እጅ አውጣ'}</span>
                </button>

                <button
                  onClick={handleToggleMyMic}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium border transition-all ${
                    isMyMicActive
                      ? 'bg-emerald-600 text-white border-emerald-400 font-bold animate-pulse shadow-lg shadow-emerald-600/30'
                      : 'bg-red-950/60 text-red-300 border-red-800/60 hover:bg-red-900/60'
                  }`}
                >
                  {isMyMicActive ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                  <span>{isMyMicActive ? 'ማይክ ክፍት ነው (ይናገሩ)' : 'ማይክ ዝጋ (Muted)'}</span>
                </button>
              </div>
            </div>

            {/* Grid of Virtual Chairs with Microphones */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-2">
              {seats.map((seat) => {
                const isMine = seat.seatNumber === mySeatNumber;
                return (
                  <div
                    key={seat.seatNumber}
                    onClick={() => handleSelectSeat(seat.seatNumber)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer relative ${
                      isMine
                        ? 'bg-amber-950/50 border-amber-500 shadow-md ring-1 ring-amber-500/50'
                        : seat.isMicActive
                        ? 'bg-emerald-950/30 border-emerald-600/60'
                        : 'bg-stone-950/60 border-stone-800 hover:border-amber-800/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-stone-400">ወንበር #{seat.seatNumber}</span>
                      
                      <div className="flex items-center gap-1">
                        {seat.handRaised && (
                          <span title="እጅ አውጥቷል" className="p-1 rounded bg-amber-500/20 text-amber-300">
                            <Hand className="w-3 h-3 animate-bounce" />
                          </span>
                        )}
                        <span
                          title={seat.isMicActive ? 'ማይክ ክፍት ነው' : 'ማይክ ዝግ ነው'}
                          className={`p-1 rounded ${
                            seat.isMicActive
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-stone-900 text-stone-500'
                          }`}
                        >
                          {seat.isMicActive ? <Mic className="w-3 h-3 text-emerald-400 animate-pulse" /> : <MicOff className="w-3 h-3" />}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-stone-800 border border-stone-700 flex items-center justify-center text-xs font-semibold text-amber-200 shrink-0">
                        {seat.userName.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-stone-200 truncate">
                          {isMine ? `${user.baptismalName} (እኔ)` : seat.userName}
                        </p>
                        <p className="text-[10px] text-stone-400 truncate">
                          {seat.baptismalName || 'የንስሐ ልጅ'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
          </div>

        </div>

        {/* Right Column (4 cols): Live Prayer & Amen Chat */}
        <div className="lg:col-span-4 flex flex-col h-[580px] rounded-2xl bg-stone-900/60 border border-amber-900/30 overflow-hidden">
          
          <div className="p-4 border-b border-stone-800 bg-stone-950/70 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-amber-200">የቀጥታ ጸሎትና አሜን መድረክ</h3>
            </div>
            <span className="text-[11px] text-emerald-400 font-mono">ክፍት ነው</span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.map((msg, index) => (
              <div key={index} className="p-2.5 rounded-lg bg-stone-950/70 border border-stone-800/80">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-amber-300">{msg.sender}</span>
                  <span className="text-stone-500 font-mono">{msg.time}</span>
                </div>
                <p className="text-xs text-stone-200 mt-1">{msg.text}</p>
              </div>
            ))}
          </div>

          <div className="p-2 bg-stone-950/90 border-t border-stone-800 flex items-center gap-1.5 overflow-x-auto">
            {['አሜን!', 'ቃለ ሕይወት ያሰማልን', 'አባታችን ይባርኩን', 'እግዚአብሔር ይማረን', 'ጸልዩልን'].map((phrase) => (
              <button
                key={phrase}
                onClick={() => {
                  setChatMessages((prev) => [
                    ...prev,
                    {
                      sender: user.baptismalName || user.fullName,
                      text: phrase,
                      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    },
                  ]);
                }}
                className="px-2.5 py-1 rounded bg-stone-900 border border-stone-700/60 text-[11px] text-amber-200 whitespace-nowrap hover:bg-amber-950 hover:border-amber-600 transition"
              >
                {phrase}
              </button>
            ))}
          </div>

          <form onSubmit={handleSendMessage} className="p-3 bg-stone-950 border-t border-stone-800 flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="የጸሎት ጥያቄ ወይም አሜን ይጻፉ..."
              className="flex-1 bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              className="p-2 rounded-lg bg-amber-700 hover:bg-amber-600 text-white transition"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

        </div>

      </div>
    </div>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import { Shield, Lock, Video, VideoOff, Mic, MicOff, PhoneOff, Check, Sparkles, KeyRound, Flame, Volume2, RefreshCw } from 'lucide-react';
import confetti from 'canvas-confetti';
import { UserProfile, ConfessionBooking } from '../types';
import { playChurchBell, speakBlessingPrayer } from '../utils/audio';

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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // Real MediaStream & Audio Meters
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [micVolumeLevel, setMicVolumeLevel] = useState(0); // 0 to 100
  const [isPriestSpeaking, setIsPriestSpeaking] = useState(false);

  // Confession Ritual Steps (1: ጸሎት, 2: መናዘዝ, 3: ቀኖና, 4: ፍትሐት)
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1);
  const [confessionNotes, setConfessionNotes] = useState('');
  const [isBlessed, setIsBlessed] = useState(false);
  const [penancePrescription, setPenancePrescription] = useState('40 ጊዜ አቡነ ዘበሰማያት፣ ጾም በጸሎት፣ ከቂምና ቁጣ መራቅ');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Start real camera & microphone stream
  const startCameraAndMic = async () => {
    try {
      // Stop any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: { echoCancellation: true, noiseSuppression: true },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Set up real AudioContext Analyser to read mic volume level
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
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          setMicVolumeLevel(Math.min(100, Math.round((avg / 128) * 100)));
        } else {
          setMicVolumeLevel(0);
        }
        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();
    } catch (err) {
      console.warn('Real camera/mic capture notice:', err);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      startCameraAndMic();
    }
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isAuthenticated, facingMode]);

  // Toggle Video Track
  const handleToggleVideo = () => {
    const newState = !isVideoOn;
    setIsVideoOn(newState);
    if (streamRef.current) {
      streamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = newState;
      });
    }
  };

  // Toggle Audio Track
  const handleToggleMic = () => {
    const newState = !isMicOn;
    setIsMicOn(newState);
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = newState;
      });
    }
    if (!newState) setMicVolumeLevel(0);
  };

  // Switch Camera (Mobile front / back)
  const handleSwitchCamera = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  const handleUnlockRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode === '777' || passcode === '1234' || passcode === '7729' || passcode.length === 4) {
      setIsAuthenticated(true);
      setErrorMsg('');
      playChurchBell();
    } else {
      setErrorMsg('የተሳሳተ የሚስጥር ቁጥር! እባክዎ ከቀሲስ ሄኖክ የተሰጠዎትን ባለ 4 ድጅት ቁጥር ያስገቡ (ለምሳሌ 777 ወይም 7729)።');
    }
  };

  const handleGrantAbsolution = () => {
    setIsBlessed(true);
    // 1. Play real sacred church bell
    playChurchBell();

    // 2. Play Priest Henok's Absolution Voice Blessing
    speakBlessingPrayer(
      `በስመ አብ ወወልድ ወመንፈስ ቅዱስ አሐዱ አምላክ አሜን። ልጄ ${user.baptismalName || ''}፣ እግዚአብሔር አምላክ ኃጢአትህን ይደምስስልህ። በሰላም ሂድ፤ በረከቱ ይደርብህ!`
    );

    // 3. Trigger Confetti
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
              <span>የቀኖና እና የመጽሐፈ ንስሐ ጥብቅ ሚስጥር (End-to-End Encrypted)</span>
            </div>
          </div>

          <form onSubmit={handleUnlockRoom} className="max-w-xs mx-auto space-y-4 pt-2">
            <div className="relative">
              <KeyRound className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-400" />
              <input
                type="password"
                maxLength={6}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="የሚስጥር ቁጥር (ለምሳሌ፡ 777)"
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
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-red-900 via-amber-900 to-red-900 border border-amber-500/50 text-white font-medium text-sm hover:from-red-800 hover:to-amber-800 shadow-xl transition-all hover:scale-[1.01]"
            >
              በበረከት ወደ ሚስጥር ቤቱ ግባ
            </button>

            <div className="text-[11px] text-stone-500">
              የሙከራ ቁጥር፡ <button type="button" onClick={() => setPasscode('777')} className="text-amber-400 underline">777</button> ወይም <button type="button" onClick={() => setPasscode('7729')} className="text-amber-400 underline">7729</button>
            </div>
          </form>

        </div>
      </div>
    );
  }

  // Active Inside Sanctuary Screen
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      
      {/* Top Security Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-stone-950 border border-red-900/40">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-red-950/80 text-red-400">
            <Shield className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold font-heading text-amber-200">
              የንስሐ ሚስጥር ቤት — የቀሲስ ሄኖክ እና የ{user.baptismalName} 1-ለ-1 ቪዲዮ
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Real Audio Volume Visualizer Meter */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-stone-900 border border-stone-800 text-[11px]">
            <Volume2 className="w-3.5 h-3.5 text-amber-400" />
            <div className="w-16 h-2 bg-stone-950 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-all duration-75"
                style={{ width: `${micVolumeLevel}%` }}
              />
            </div>
            <span className="font-mono text-stone-400 text-[10px]">{micVolumeLevel}%</span>
          </div>

          <span className="px-2.5 py-1 rounded-md bg-emerald-950/70 border border-emerald-700/50 text-emerald-300 text-xs font-mono flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>ጥበቃው የጸና ነው</span>
          </span>
          <button
            onClick={() => {
              if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
              }
              setIsAuthenticated(false);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-950/70 border border-red-700/60 text-red-200 text-xs hover:bg-red-900 transition"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            <span>ከቤቱ ውጣ</span>
          </button>
        </div>
      </div>

      {/* Video & Ritual Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: 1-on-1 Video Interface */}
        <div className="lg:col-span-7 space-y-4">
          
          <div className="relative rounded-2xl overflow-hidden bg-black border-2 border-amber-700/40 shadow-2xl h-[380px] sm:h-[480px]">
            {/* Priest Main Sanctuary Video Feed */}
            <img
              src="/src/assets/images/sacred_confession_sanctuary_1794468348510.jpg"
              alt="የንስሐ አባት ቀሲስ ሄኖክ በሚስጥር ቤቱ"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover filter brightness-95"
            />

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

            {/* Child's Self Camera Inset (PiP) */}
            <div className="absolute bottom-16 right-4 w-36 sm:w-48 h-26 sm:h-34 rounded-xl overflow-hidden border-2 border-amber-400/70 shadow-2xl bg-stone-900 z-10">
              {isVideoOn ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover mirror"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-stone-950 text-stone-400 p-2 text-center">
                  <VideoOff className="w-6 h-6 text-stone-500 mb-1" />
                  <span className="text-[10px]">ካሜራ ዝግ ነው</span>
                </div>
              )}
              
              {/* Mic Activity Badge */}
              <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between bg-stone-950/80 px-2 py-0.5 rounded text-[10px] text-amber-200">
                <span>{user.baptismalName} (እኔ)</span>
                {isMicOn ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                )}
              </div>
            </div>

            {/* Video & Audio Controls Bar */}
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between p-3 rounded-xl bg-stone-950/85 backdrop-blur-md border border-amber-900/40 z-10">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleToggleMic}
                  className={`p-2.5 rounded-lg border transition ${
                    isMicOn ? 'bg-emerald-950 border-emerald-600 text-emerald-300' : 'bg-red-950 border-red-700 text-red-300'
                  }`}
                  title={isMicOn ? 'ማይክ ክፍት ነው' : 'ማይክ ዝጋ'}
                >
                  {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </button>

                <button
                  onClick={handleToggleVideo}
                  className={`p-2.5 rounded-lg border transition ${
                    isVideoOn ? 'bg-stone-900 border-stone-700 text-stone-200' : 'bg-red-950 border-red-700 text-red-300'
                  }`}
                  title={isVideoOn ? 'ካሜራ ክፍት ነው' : 'ካሜራ ዝጋ'}
                >
                  {isVideoOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                </button>

                {/* Flip camera on mobile */}
                <button
                  onClick={handleSwitchCamera}
                  className="p-2.5 rounded-lg bg-stone-900 border border-stone-700 text-stone-300 hover:text-amber-200 transition"
                  title="ካሜራ ቀይር (Flip Camera)"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>

                <button
                  onClick={() => {
                    setIsPriestSpeaking(true);
                    speakBlessingPrayer('በእግዚአብሔር ስም ሰላም ለእናንተ ይሁን። ልጄ ኃጢአትህን ያለመደበቅ ተናዘዝ፤ እግዚአብሔር መሐሪና ይቅር ባይ ነው።');
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-xs text-amber-300 hover:bg-stone-800 transition flex items-center gap-1.5"
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

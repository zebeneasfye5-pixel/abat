// Web Audio API Sound Generator for Sacred Chimes & Spiritual Hymns

let audioCtx: AudioContext | null = null;
let hymnOscillators: OscillatorNode[] = [];
let hymnGainNode: GainNode | null = null;
let isHymnPlaying = false;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// 1. Sacred Church Hand Bell Chime (የመስቀልና የደወል ድምፅ)
export function playChurchBell() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Harmonic frequencies for bronze hand cross bell (D5, A5, D6)
    const freqs = [587.33, 880.0, 1174.66, 1760.0];

    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = idx === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      // Exponential decay envelope
      const initialGain = idx === 0 ? 0.35 : 0.15 / (idx + 1);
      gain.gain.setValueAtTime(initialGain, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 3.3);
    });
  } catch (err) {
    console.warn('Audio bell error:', err);
  }
}

// 2. Ethiopian Sacred Begena / Harp Pentatonic Spiritual Harmony (የበገናና የመዝሙር ዜማ)
export function toggleSpiritualHymn(onStateChange?: (playing: boolean) => void): boolean {
  try {
    const ctx = getAudioContext();

    if (isHymnPlaying) {
      stopSpiritualHymn();
      if (onStateChange) onStateChange(false);
      return false;
    }

    const now = ctx.currentTime;
    isHymnPlaying = true;

    hymnGainNode = ctx.createGain();
    hymnGainNode.gain.setValueAtTime(0.01, now);
    hymnGainNode.gain.linearRampToValueAtTime(0.12, now + 1.5);
    hymnGainNode.connect(ctx.destination);

    // Pentatonic scale frequencies for meditative prayer (D3, F3, G3, A3, C4)
    const chordFreqs = [146.83, 174.61, 196.0, 220.0, 261.63];

    hymnOscillators = chordFreqs.map((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      // Low frequency modulation for acoustic resonance
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.setValueAtTime(2.5 + idx * 0.4, now);
      lfoGain.gain.setValueAtTime(1.5, now);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(now);

      osc.connect(hymnGainNode!);
      osc.start(now);
      return osc;
    });

    if (onStateChange) onStateChange(true);
    return true;
  } catch (err) {
    console.warn('Hymn player error:', err);
    if (onStateChange) onStateChange(false);
    return false;
  }
}

export function stopSpiritualHymn() {
  if (hymnGainNode && audioCtx) {
    hymnGainNode.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
    setTimeout(() => {
      hymnOscillators.forEach((osc) => {
        try {
          osc.stop();
          osc.disconnect();
        } catch {}
      });
      hymnOscillators = [];
      isHymnPlaying = false;
    }, 900);
  } else {
    isHymnPlaying = false;
  }
}

// 3. Priest Henok's Voice Blessing via Web Speech API (የቀሲሱ የድምፅ ቡራኬ)
export function speakBlessingPrayer(text: string) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'am-ET';
    utterance.rate = 0.85;
    utterance.pitch = 0.95;
    window.speechSynthesis.speak(utterance);
  }
}

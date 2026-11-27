import React from 'react';

export type VideoLightMode = 'auto' | 'night' | 'day';
export type DetectedLighting = 'bright' | 'dim' | 'dark';

let sharedSampleCanvas: HTMLCanvasElement | null = null;
let sharedAudioCtx: AudioContext | null = null;

/**
 * Unlock/prewarm Web Audio API right inside a user navigation click
 * so incoming call audio starts playing immediately with zero autoplay delay.
 */
export function prewarmAudioPlayback(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    // Play a silent 1-sample buffer to permanently unlock audio output on iOS/Android
    const buf = sharedAudioCtx.createBuffer(1, 1, sharedAudioCtx.sampleRate || 48000);
    const src = sharedAudioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(sharedAudioCtx.destination);
    src.start(0);
  } catch {
    // Ignore on restricted environments
  }
}

/**
 * Ultra-lightweight (<0.1ms) luminance sampler on a tiny 24x16 canvas
 * to detect whether a video feed is in bright daylight, dim indoor light, or dark night.
 */
export function sampleElementBrightness(
  el: HTMLVideoElement | HTMLImageElement | null
): number | null {
  if (!el || typeof document === 'undefined') return null;

  if (el instanceof HTMLVideoElement) {
    if (el.readyState < 2 || el.videoWidth === 0 || el.videoHeight === 0) return null;
  } else {
    if (!el.complete || el.naturalWidth === 0) return null;
  }

  try {
    if (!sharedSampleCanvas) {
      sharedSampleCanvas = document.createElement('canvas');
      sharedSampleCanvas.width = 24;
      sharedSampleCanvas.height = 16;
    }
    const ctx = sharedSampleCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(el, 0, 0, 24, 16);
    const pixels = ctx.getImageData(0, 0, 24, 16).data;
    let lumaSum = 0;
    const total = pixels.length / 4;
    for (let i = 0; i < pixels.length; i += 4) {
      // Rec. 601 perceived luminance
      lumaSum += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    }
    return lumaSum / total;
  } catch {
    return null;
  }
}

export function classifyBrightness(
  luma: number | null,
  previous: DetectedLighting = 'dim'
): DetectedLighting {
  if (luma === null) return previous;
  // Hysteresis avoids rapid flickering around threshold boundaries
  if (previous === 'dark') {
    if (luma > 82) return luma > 128 ? 'bright' : 'dim';
    return 'dark';
  }
  if (previous === 'bright') {
    if (luma < 112) return luma < 68 ? 'dark' : 'dim';
    return 'bright';
  }
  if (luma < 72) return 'dark';
  if (luma > 122) return 'bright';
  return 'dim';
}

export function resolveVideoFilterCss(
  mode: VideoLightMode,
  detected: DetectedLighting
): string {
  const effective: DetectedLighting =
    mode === 'night' ? 'dark' : mode === 'day' ? 'bright' : detected;

  if (effective === 'dark') {
    // Non-linear gamma shadow lift + crisp contrast for clear night-time visibility
    return 'url(#qh-night-vision-filter) contrast(1.06) saturate(1.06)';
  }
  if (effective === 'dim') {
    return 'url(#qh-dim-enhance-filter) contrast(1.05) saturate(1.07)';
  }
  return 'url(#qh-day-crisp-filter) contrast(1.04) saturate(1.08)';
}

/**
 * Tunes hardware camera exposure, white balance, and autofocus constraints
 * when supported by the phone/webcam driver.
 */
export async function enhanceCameraTrackHardware(
  track: MediaStreamTrack | null | undefined,
  mode: VideoLightMode
): Promise<void> {
  if (!track || track.kind !== 'video') return;
  try {
    const caps = (track.getCapabilities?.() || {}) as Record<string, any>;
    const advanced: Record<string, any> = {};

    if (Array.isArray(caps.exposureMode) && caps.exposureMode.includes('continuous')) {
      advanced.exposureMode = 'continuous';
    }
    if (Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes('continuous')) {
      advanced.whiteBalanceMode = 'continuous';
    }
    if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
      advanced.focusMode = 'continuous';
    }

    if (caps.exposureCompensation && typeof caps.exposureCompensation.max === 'number') {
      const targetEv = mode === 'night' ? Math.min(caps.exposureCompensation.max, 1.5) : mode === 'auto' ? Math.min(caps.exposureCompensation.max, 0.7) : 0;
      const minEv = typeof caps.exposureCompensation.min === 'number' ? caps.exposureCompensation.min : -2;
      advanced.exposureCompensation = Math.max(minEv, targetEv);
    }

    if (caps.brightness && typeof caps.brightness.max === 'number' && typeof caps.brightness.min === 'number') {
      const mid = (caps.brightness.min + caps.brightness.max) / 2;
      const span = caps.brightness.max - caps.brightness.min;
      if (mode === 'night') {
        advanced.brightness = Math.min(caps.brightness.max, mid + span * 0.22);
      } else if (mode === 'auto') {
        advanced.brightness = Math.min(caps.brightness.max, mid + span * 0.08);
      }
    }

    if (Object.keys(advanced).length > 0) {
      await track.applyConstraints({ advanced: [advanced as MediaTrackConstraintSet] });
    }
  } catch {
    // Hardware drivers vary; software gamma/tone filter guarantees visibility universally
  }
}

/**
 * GPU-accelerated SVG non-linear tone mapping & crispness filters.
 * Uses gamma curve (<1) so dark/night shadows brighten cleanly without blowing out bright daylight highlights.
 */
export const VideoEnhancerFilters: React.FC = () => (
  <svg
    aria-hidden="true"
    width="0"
    height="0"
    style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none', overflow: 'hidden' }}
  >
    <defs>
      {/* Daylight Crisp HD: subtle tonal punch + clean sharpness */}
      <filter id="qh-day-crisp-filter" colorInterpolationFilters="sRGB">
        <feComponentTransfer>
          <feFuncR type="gamma" amplitude="1.03" exponent="0.93" offset="0" />
          <feFuncG type="gamma" amplitude="1.03" exponent="0.93" offset="0" />
          <feFuncB type="gamma" amplitude="1.03" exponent="0.93" offset="0" />
        </feComponentTransfer>
      </filter>

      {/* Indoor / Evening Low-Light Enhancement */}
      <filter id="qh-dim-enhance-filter" colorInterpolationFilters="sRGB">
        <feComponentTransfer>
          <feFuncR type="gamma" amplitude="1.12" exponent="0.72" offset="0.015" />
          <feFuncG type="gamma" amplitude="1.12" exponent="0.72" offset="0.015" />
          <feFuncB type="gamma" amplitude="1.10" exponent="0.73" offset="0.015" />
        </feComponentTransfer>
      </filter>

      {/* Night Vision Clarity Boost: lifts dark shadows dramatically while preserving face details */}
      <filter id="qh-night-vision-filter" colorInterpolationFilters="sRGB">
        <feComponentTransfer>
          <feFuncR type="gamma" amplitude="1.28" exponent="0.52" offset="0.045" />
          <feFuncG type="gamma" amplitude="1.28" exponent="0.52" offset="0.045" />
          <feFuncB type="gamma" amplitude="1.24" exponent="0.54" offset="0.04" />
        </feComponentTransfer>
      </filter>
    </defs>
  </svg>
);

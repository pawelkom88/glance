/**
 * Voice Activity Detection (VAD) — core controller
 */

export const MIN_VOICE_PAUSE_DELAY_MS = 500;
export const MAX_VOICE_PAUSE_DELAY_MS = 3000;
export const VOICE_PAUSE_DELAY_STEP_MS = 500;
export const DEFAULT_VOICE_PAUSE_DELAY_MS = 1500;
export const MEDIUM_VOICE_RMS_THRESHOLD = 0.035;
const ADAPTIVE_VOICE_MARGIN_RMS = 0.018;
const ADAPTIVE_NOISE_FLOOR_SMOOTHING = 0.18;
const MAX_ADAPTIVE_VOICE_RMS_THRESHOLD = 0.08;

/** Interval at which the AnalyserNode is polled (ms). */
const POLL_INTERVAL_MS = 80;

export interface VoiceActivitySupport {
  readonly AudioContextConstructor: typeof AudioContext;
  readonly getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
}

export interface VoiceActivityErrorInfo {
  readonly permissionError: string;
  readonly runtimeStatus: 'denied' | 'unsupported' | 'error';
}

export interface VoiceActivityControllerOptions {
  readonly audioContext: AudioContext;
  readonly stream: MediaStream;
  readonly silenceDelayMs: number;
  readonly onSilence: () => void;
  readonly onSpeech: () => void;
}

export interface VoiceActivityController {
  start(): void;
  destroy(): void;
}

export function getVoiceActivitySupport(): VoiceActivitySupport | null {
  const AudioContextConstructor = globalThis.AudioContext
    ?? (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const getUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);

  if (!AudioContextConstructor || !getUserMedia) {
    return null;
  }

  return {
    AudioContextConstructor,
    getUserMedia
  };
}

export async function requestVoiceActivityStream(): Promise<MediaStream> {
  const support = getVoiceActivitySupport();

  if (!support) {
    throw new Error('Voice auto-pause is unavailable on this device.');
  }

  return support.getUserMedia({ audio: true, video: false });
}

export function classifyVoiceActivityError(error: unknown): VoiceActivityErrorInfo {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return {
        permissionError: 'Microphone access denied.',
        runtimeStatus: 'denied'
      };
    }

    if (error.name === 'NotFoundError') {
      return {
        permissionError: 'No microphone was found for voice auto-pause.',
        runtimeStatus: 'error'
      };
    }

    if (error.name === 'NotReadableError' || error.name === 'AbortError') {
      return {
        permissionError: 'Glance could not start microphone monitoring.',
        runtimeStatus: 'error'
      };
    }
  }

  if (error instanceof Error) {
    if (error.message === 'Voice auto-pause is unavailable on this device.') {
      return {
        permissionError: error.message,
        runtimeStatus: 'unsupported'
      };
    }

    return {
      permissionError: error.message || 'Glance could not start microphone monitoring.',
      runtimeStatus: 'error'
    };
  }

  return {
    permissionError: 'Glance could not start microphone monitoring.',
    runtimeStatus: 'error'
  };
}

export function normalizeVoicePauseDelayMs(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_VOICE_PAUSE_DELAY_MS;
  }

  const clamped = Math.min(MAX_VOICE_PAUSE_DELAY_MS, Math.max(MIN_VOICE_PAUSE_DELAY_MS, Math.round(value)));
  const snapped = Math.round(clamped / VOICE_PAUSE_DELAY_STEP_MS) * VOICE_PAUSE_DELAY_STEP_MS;
  return Math.min(MAX_VOICE_PAUSE_DELAY_MS, Math.max(MIN_VOICE_PAUSE_DELAY_MS, snapped));
}

export function formatVoicePauseDelayLabel(delayMs: number, locale: string): string {
  const seconds = normalizeVoicePauseDelayMs(delayMs) / 1000;
  const formatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: Number.isInteger(seconds) ? 0 : 1,
    maximumFractionDigits: 1
  });
  return `${formatter.format(seconds)}s`;
}

export function createVoiceActivityController(
  options: VoiceActivityControllerOptions
): VoiceActivityController {
  const { audioContext, stream, silenceDelayMs, onSilence, onSpeech } = options;

  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;

  const source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);

  const buffer = new Uint8Array(analyser.fftSize);
  const normalizedDelayMs = normalizeVoicePauseDelayMs(silenceDelayMs);
  const silentTicksRequired = Math.ceil(normalizedDelayMs / POLL_INTERVAL_MS);

  let pollIntervalId: ReturnType<typeof setInterval> | null = null;
  let silentTicks = 0;
  let vadPaused = false;
  let destroyed = false;
  let noiseFloorRms = MEDIUM_VOICE_RMS_THRESHOLD / 2;

  function computeRms(): number {
    analyser.getByteTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      const sample = (buffer[i] - 128) / 128;
      sum += sample * sample;
    }
    return Math.sqrt(sum / buffer.length);
  }

  function poll() {
    if (destroyed) {
      return;
    }

    const currentRms = computeRms();
    const adaptiveSpeechThreshold = Math.min(
      MAX_ADAPTIVE_VOICE_RMS_THRESHOLD,
      Math.max(MEDIUM_VOICE_RMS_THRESHOLD, noiseFloorRms + ADAPTIVE_VOICE_MARGIN_RMS)
    );
    const cappedNoiseSample = Math.min(currentRms, Math.max(noiseFloorRms, adaptiveSpeechThreshold - 0.006));

    noiseFloorRms = (
      noiseFloorRms * (1 - ADAPTIVE_NOISE_FLOOR_SMOOTHING)
      + cappedNoiseSample * ADAPTIVE_NOISE_FLOOR_SMOOTHING
    );

    const isSilent = currentRms < adaptiveSpeechThreshold;

    if (isSilent) {
      silentTicks += 1;
      if (!vadPaused && silentTicks >= silentTicksRequired) {
        vadPaused = true;
        onSilence();
      }
      return;
    }

    silentTicks = 0;
    if (vadPaused) {
      vadPaused = false;
      onSpeech();
    }
  }

  return {
    start() {
      if (destroyed || pollIntervalId !== null) {
        return;
      }

      pollIntervalId = setInterval(poll, POLL_INTERVAL_MS);
    },

    destroy() {
      if (destroyed) {
        return;
      }

      destroyed = true;

      if (pollIntervalId !== null) {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
      }

      source.disconnect();

      for (const track of stream.getTracks()) {
        track.stop();
      }

      void audioContext.close();
    }
  };
}

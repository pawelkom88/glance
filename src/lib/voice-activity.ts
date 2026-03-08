/**
 * Voice Activity Detection (VAD) — core controller
 */

export const MIN_VOICE_PAUSE_DELAY_MS = 500;
export const MAX_VOICE_PAUSE_DELAY_MS = 3000;
export const VOICE_PAUSE_DELAY_STEP_MS = 500;
export const DEFAULT_VOICE_PAUSE_DELAY_MS = 1500;
export const MEDIUM_VOICE_RMS_THRESHOLD = 0.035;

/** Interval at which the AnalyserNode is polled (ms). */
const POLL_INTERVAL_MS = 80;

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

    const isSilent = computeRms() < MEDIUM_VOICE_RMS_THRESHOLD;

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

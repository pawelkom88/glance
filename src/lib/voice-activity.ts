/**
 * Voice Activity Detection (VAD) — core library
 */

import { VadSensitivity } from '../types';

export { VadSensitivity };

export interface VadPrefs {
    readonly enabled: boolean;
    readonly sensitivity: VadSensitivity;
}

const PREFS_STORAGE_KEY = 'glance-vad-prefs-v1';

const DEFAULT_PREFS: VadPrefs = {
    enabled: false,
    sensitivity: VadSensitivity.Medium,
};

export function readVadPrefs(): VadPrefs {
    if (typeof window === 'undefined') {
        return DEFAULT_PREFS;
    }

    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) {
        return DEFAULT_PREFS;
    }

    try {
        const parsed = JSON.parse(raw) as Partial<VadPrefs>;
        const enabled = typeof parsed.enabled === 'boolean' ? parsed.enabled : false;
        let sensitivity = VadSensitivity.Medium;
        if (parsed.sensitivity === 'low') sensitivity = VadSensitivity.Low;
        if (parsed.sensitivity === 'medium') sensitivity = VadSensitivity.Medium;
        if (parsed.sensitivity === 'high') sensitivity = VadSensitivity.High;

        return { enabled, sensitivity };
    } catch {
        return DEFAULT_PREFS;
    }
}

export function writeVadPrefs(prefs: VadPrefs): void {
    if (typeof window === 'undefined') {
        return;
    }

    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
}

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------


/**
 * RMS thresholds — audio below this level is considered silence.
 * Higher sensitivity → lower threshold (triggers on quieter audio).
 */
export const VAD_RMS_THRESHOLDS: Record<VadSensitivity, number> = {
    [VadSensitivity.Low]: 0.06,
    [VadSensitivity.Medium]: 0.035,
    [VadSensitivity.High]: 0.018,
};

/**
 * How many milliseconds of continuous silence is required before `onSilence`
 * fires. Lower sensitivity → longer wait (less aggressive pausing).
 */
export const VAD_SILENCE_DURATION_MS: Record<VadSensitivity, number> = {
    [VadSensitivity.Low]: 2500,
    [VadSensitivity.Medium]: 1500,
    [VadSensitivity.High]: 800,
};

/** Interval at which the AnalyserNode is polled (ms). */
const POLL_INTERVAL_MS = 80;


// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export interface VoiceActivityControllerOptions {
    readonly audioContext: AudioContext;
    readonly stream: MediaStream;
    readonly sensitivity: VadSensitivity;
    readonly onSilence: () => void;
    readonly onSpeech: () => void;
}

export interface VoiceActivityController {
    /** Begin polling the microphone stream. */
    start(): void;
    /** Stop polling, release the stream tracks, and close the AudioContext. */
    destroy(): void;
}

/**
 * Creates a VAD controller that drives `onSilence` / `onSpeech` callbacks
 * based on RMS energy analysis.
 */
export function createVoiceActivityController(
    options: VoiceActivityControllerOptions
): VoiceActivityController {
    const { audioContext, stream, sensitivity, onSilence, onSpeech } = options;

    const rmsThreshold = VAD_RMS_THRESHOLDS[sensitivity];
    const silenceDurationMs = VAD_SILENCE_DURATION_MS[sensitivity];

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const buffer = new Uint8Array(analyser.fftSize);

    let pollIntervalId: ReturnType<typeof setInterval> | null = null;
    // Number of consecutive silent ticks. Using ticks (not Date.now()) so that
    // vi.useFakeTimers() advances time correctly in tests.
    let silentTicks = 0;
    const silenceTicksRequired = Math.ceil(silenceDurationMs / POLL_INTERVAL_MS);
    let vadPaused = false;
    let destroyed = false;

    function computeRms(): number {
        analyser.getByteTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
            // Normalise from [0, 255] → [-1, 1]
            const sample = (buffer[i] - 128) / 128;
            sum += sample * sample;
        }
        return Math.sqrt(sum / buffer.length);
    }

    function poll() {
        if (destroyed) {
            return;
        }

        const rms = computeRms();
        const isSilent = rms < rmsThreshold;

        if (isSilent) {
            silentTicks++;
            if (!vadPaused && silentTicks >= silenceTicksRequired) {
                vadPaused = true;
                onSilence();
            }
        } else {
            // Speech detected — reset silence counter
            silentTicks = 0;
            if (vadPaused) {
                vadPaused = false;
                onSpeech();
            }
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
        },
    };
}

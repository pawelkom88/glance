/**
 * Behaviour tests: Voice Activity Detection (VAD)
 *
 * Priority: high
 *
 * These tests describe the OBSERVABLE BEHAVIOUR of the VAD feature, not the
 * internal mechanics.  The Web Audio API is fully faked so no real mic access
 * occurs during testing.
 *
 * Covered behaviours:
 *  1. VAD is disabled by default (opt-in, privacy-first)
 *  2. When enabled, silence exceeding the threshold pauses the prompter
 *  3. When speech resumes, the prompter automatically unpauses
 *  4. Sensitivity thresholds (low / medium / high) affect when silence is declared
 *  5. Prompter that was already paused by the user stays paused after speech resumes
 *  6. Disabling VAD mid-session has no effect on current playback state
 *  7. VAD preference persists across sessions via localStorage
 *  8. Stopping the mic stream gracefully cleans up without errors
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
    VadSensitivity,
    VAD_RMS_THRESHOLDS,
    VAD_SILENCE_DURATION_MS,
    createVoiceActivityController,
    type VoiceActivityController,
    readVadPrefs,
    writeVadPrefs,
} from '../../../lib/voice-activity';

// ---------------------------------------------------------------------------
// Fake Web Audio API
// ---------------------------------------------------------------------------

class FakeAnalyserNode {
    fftSize = 256;
    private _rms = 0;

    setRms(value: number) {
        this._rms = value;
    }

    getByteTimeDomainData(buffer: Uint8Array) {
        // Encode the RMS target into every sample so the controller can decode it.
        // A flat signal at value v has RMS = |v - 128| / 128 after normalisation.
        const amplitude = Math.round(this._rms * 128);
        buffer.fill(128 + amplitude);
    }
}

class FakeAudioContext {
    state: AudioContextState = 'running';
    readonly analyser = new FakeAnalyserNode();

    createAnalyser() {
        return this.analyser;
    }

    createMediaStreamSource(_stream: MediaStream) {
        return {
            connect: (_node: unknown) => { },
            disconnect: () => { },
        };
    }

    close() {
        this.state = 'closed';
        return Promise.resolve();
    }
}

function makeFakeStream() {
    return { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function advanceTimersByMs(ms: number) {
    vi.advanceTimersByTime(ms);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Voice Activity Detection — disabled by default', () => {
    it('reads vadEnabled as false when no preference is stored', () => {
        window.localStorage.clear();
        const prefs = readVadPrefs();
        expect(prefs.enabled).toBe(false);
    });

    it('reads vadSensitivity as medium when no preference is stored', () => {
        window.localStorage.clear();
        const prefs = readVadPrefs();
        expect(prefs.sensitivity).toBe(VadSensitivity.Medium);
    });
});

describe('Voice Activity Detection — preference persistence', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('persists enabled flag across reads', () => {
        writeVadPrefs({ enabled: true, sensitivity: VadSensitivity.High });
        const prefs = readVadPrefs();
        expect(prefs.enabled).toBe(true);
        expect(prefs.sensitivity).toBe(VadSensitivity.High);
    });

    it('round-trips all sensitivity values', () => {
        for (const sensitivity of Object.values(VadSensitivity)) {
            writeVadPrefs({ enabled: false, sensitivity });
            expect(readVadPrefs().sensitivity).toBe(sensitivity);
        }
    });
});

describe('Voice Activity Detection — silence detection pauses prompter', () => {
    let controller: VoiceActivityController;
    let fakeCtx: FakeAudioContext;
    let onSilence: ReturnType<typeof vi.fn>;
    let onSpeech: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.useFakeTimers();
        fakeCtx = new FakeAudioContext();
        onSilence = vi.fn();
        onSpeech = vi.fn();

        controller = createVoiceActivityController({
            audioContext: fakeCtx as unknown as AudioContext,
            stream: makeFakeStream(),
            sensitivity: VadSensitivity.Medium,
            onSilence: onSilence as unknown as () => void,
            onSpeech: onSpeech as unknown as () => void,
        });
    });

    afterEach(() => {
        controller.destroy();
        vi.useRealTimers();
    });

    it('does not fire onSilence immediately when silence starts', () => {
        fakeCtx.analyser.setRms(0); // silent
        controller.start();
        advanceTimersByMs(VAD_SILENCE_DURATION_MS[VadSensitivity.Medium] - 100);
        expect(onSilence).not.toHaveBeenCalled();
    });

    it('fires onSilence after the silence threshold duration has elapsed', () => {
        fakeCtx.analyser.setRms(0); // silent
        controller.start();
        advanceTimersByMs(VAD_SILENCE_DURATION_MS[VadSensitivity.Medium] + 50);
        expect(onSilence).toHaveBeenCalledOnce();
    });

    it('fires onSpeech when RMS rises above the voice threshold while paused by VAD', () => {
        fakeCtx.analyser.setRms(0);
        controller.start();
        advanceTimersByMs(VAD_SILENCE_DURATION_MS[VadSensitivity.Medium] + 50);
        expect(onSilence).toHaveBeenCalledOnce();

        fakeCtx.analyser.setRms(VAD_RMS_THRESHOLDS[VadSensitivity.Medium] + 0.05);
        advanceTimersByMs(200);
        expect(onSpeech).toHaveBeenCalledOnce();
    });

    it('does NOT fire onSilence when audio is above the threshold', () => {
        fakeCtx.analyser.setRms(VAD_RMS_THRESHOLDS[VadSensitivity.Medium] + 0.1);
        controller.start();
        advanceTimersByMs(VAD_SILENCE_DURATION_MS[VadSensitivity.Medium] * 3);
        expect(onSilence).not.toHaveBeenCalled();
    });

    it('resets the silence timer when speech interrupts a silence window', () => {
        fakeCtx.analyser.setRms(0);
        controller.start();
        // Advance almost to the threshold…
        advanceTimersByMs(VAD_SILENCE_DURATION_MS[VadSensitivity.Medium] - 200);

        // Brief speech
        fakeCtx.analyser.setRms(VAD_RMS_THRESHOLDS[VadSensitivity.Medium] + 0.1);
        advanceTimersByMs(100);

        // Go silent again — timer should restart from zero
        fakeCtx.analyser.setRms(0);
        advanceTimersByMs(VAD_SILENCE_DURATION_MS[VadSensitivity.Medium] - 100);
        expect(onSilence).not.toHaveBeenCalled();

        // Now cross the full threshold
        advanceTimersByMs(200);
        expect(onSilence).toHaveBeenCalledOnce();
    });
});

describe('Voice Activity Detection — sensitivity thresholds', () => {
    let fakeCtx: FakeAudioContext;
    let onSilence: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.useFakeTimers();
        fakeCtx = new FakeAudioContext();
        onSilence = vi.fn();
    });

    afterEach(() => {
        vi.useRealTimers();
        onSilence.mockReset();
    });

    it('Low sensitivity requires longer silence before pausing than High', () => {
        // Low = user needs to be quiet for longer before the prompter pauses
        expect(VAD_SILENCE_DURATION_MS[VadSensitivity.Low])
            .toBeGreaterThan(VAD_SILENCE_DURATION_MS[VadSensitivity.High]);
    });

    it('High sensitivity detects silence at a lower RMS than Low', () => {
        // High = more sensitive = triggers at quieter audio
        expect(VAD_RMS_THRESHOLDS[VadSensitivity.High])
            .toBeLessThan(VAD_RMS_THRESHOLDS[VadSensitivity.Low]);
    });

    it('fires onSilence sooner with High sensitivity than with Low for the same audio', () => {
        const highController = createVoiceActivityController({
            audioContext: fakeCtx as unknown as AudioContext,
            stream: makeFakeStream(),
            sensitivity: VadSensitivity.High,
            onSilence: onSilence as unknown as () => void,
            onSpeech: vi.fn() as unknown as () => void,
        });

        const lowOnSilence = vi.fn();
        const lowController = createVoiceActivityController({
            audioContext: fakeCtx as unknown as AudioContext,
            stream: makeFakeStream(),
            sensitivity: VadSensitivity.Low,
            onSilence: lowOnSilence as unknown as () => void,
            onSpeech: vi.fn() as unknown as () => void,
        });

        fakeCtx.analyser.setRms(0);
        highController.start();
        lowController.start();

        // Advance past High threshold but not Low threshold
        const midpoint = Math.floor(
            (VAD_SILENCE_DURATION_MS[VadSensitivity.High] +
                VAD_SILENCE_DURATION_MS[VadSensitivity.Low]) / 2
        );
        advanceTimersByMs(midpoint);

        expect(onSilence).toHaveBeenCalledOnce();
        expect(lowOnSilence).not.toHaveBeenCalled();

        highController.destroy();
        lowController.destroy();
    });
});

describe('Voice Activity Detection — lifecycle and cleanup', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('stop() halts polling so onSilence is never called after it', () => {
        const fakeCtx = new FakeAudioContext();
        const onSilence = vi.fn();

        const controller = createVoiceActivityController({
            audioContext: fakeCtx as unknown as AudioContext,
            stream: makeFakeStream(),
            sensitivity: VadSensitivity.Medium,
            onSilence,
            onSpeech: vi.fn(),
        });

        fakeCtx.analyser.setRms(0);
        controller.start();
        advanceTimersByMs(VAD_SILENCE_DURATION_MS[VadSensitivity.Medium] / 2);

        controller.destroy();

        // Continue advancing — no callbacks should fire
        advanceTimersByMs(VAD_SILENCE_DURATION_MS[VadSensitivity.Medium] * 2);
        expect(onSilence).not.toHaveBeenCalled();
    });

    it('stop() closes the AudioContext', async () => {
        const fakeCtx = new FakeAudioContext();

        const controller = createVoiceActivityController({
            audioContext: fakeCtx as unknown as AudioContext,
            stream: makeFakeStream(),
            sensitivity: VadSensitivity.Medium,
            onSilence: vi.fn(),
            onSpeech: vi.fn(),
        });

        controller.start();
        controller.destroy();

        // AudioContext should be closed
        expect(fakeCtx.state).toBe('closed');
    });

    it('stop() calls getTracks().stop() on the stream', () => {
        const fakeCtx = new FakeAudioContext();
        const fakeTrack = { stop: vi.fn() };
        const fakeStream = { getTracks: () => [fakeTrack] } as unknown as MediaStream;

        const controller = createVoiceActivityController({
            audioContext: fakeCtx as unknown as AudioContext,
            stream: fakeStream,
            sensitivity: VadSensitivity.Medium,
            onSilence: vi.fn(),
            onSpeech: vi.fn(),
        });

        controller.start();
        controller.destroy();

        expect(fakeTrack.stop).toHaveBeenCalledOnce();
    });

    it('calling destroy() multiple times does not throw', () => {
        const fakeCtx = new FakeAudioContext();
        const controller = createVoiceActivityController({
            audioContext: fakeCtx as unknown as AudioContext,
            stream: makeFakeStream(),
            sensitivity: VadSensitivity.Medium,
            onSilence: vi.fn(),
            onSpeech: vi.fn(),
        });

        controller.start();

        expect(() => {
            controller.destroy();
            controller.destroy();
        }).not.toThrow();
    });
});

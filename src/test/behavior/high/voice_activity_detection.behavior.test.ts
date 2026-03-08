/**
 * Behaviour tests: Voice Activity Detection (VAD)
 *
 * Priority: high
 *
 * These tests describe the observable behaviour of the pause-delay controller.
 * The Web Audio API is fully faked so no real mic access occurs during testing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_VOICE_PAUSE_DELAY_MS,
  MAX_VOICE_PAUSE_DELAY_MS,
  MEDIUM_VOICE_RMS_THRESHOLD,
  MIN_VOICE_PAUSE_DELAY_MS,
  VOICE_PAUSE_DELAY_STEP_MS,
  createVoiceActivityController,
  formatVoicePauseDelayLabel,
  normalizeVoicePauseDelayMs,
  type VoiceActivityController
} from '../../../lib/voice-activity';

class FakeAnalyserNode {
  fftSize = 256;
  private rms = 0;

  setRms(value: number) {
    this.rms = value;
  }

  getByteTimeDomainData(buffer: Uint8Array) {
    const amplitude = Math.round(this.rms * 128);
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
      connect: (_node: unknown) => {},
      disconnect: () => {}
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

function advanceTimersByMs(ms: number) {
  vi.advanceTimersByTime(ms);
}

describe('Voice Activity Detection — silence delay behavior', () => {
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
      silenceDelayMs: DEFAULT_VOICE_PAUSE_DELAY_MS,
      onSilence: onSilence as unknown as () => void,
      onSpeech: onSpeech as unknown as () => void
    });
  });

  afterEach(() => {
    controller.destroy();
    vi.useRealTimers();
  });

  it('does not fire onSilence before the configured delay elapses', () => {
    fakeCtx.analyser.setRms(0);
    controller.start();

    advanceTimersByMs(DEFAULT_VOICE_PAUSE_DELAY_MS - 100);

    expect(onSilence).not.toHaveBeenCalled();
  });

  it('fires onSilence after the configured delay elapses', () => {
    fakeCtx.analyser.setRms(0);
    controller.start();

    advanceTimersByMs(DEFAULT_VOICE_PAUSE_DELAY_MS + 50);

    expect(onSilence).toHaveBeenCalledOnce();
  });

  it('fires onSpeech when audio rises above the fixed speech threshold after a VAD pause', () => {
    fakeCtx.analyser.setRms(0);
    controller.start();
    advanceTimersByMs(DEFAULT_VOICE_PAUSE_DELAY_MS + 50);

    fakeCtx.analyser.setRms(MEDIUM_VOICE_RMS_THRESHOLD + 0.05);
    advanceTimersByMs(200);

    expect(onSilence).toHaveBeenCalledOnce();
    expect(onSpeech).toHaveBeenCalledOnce();
  });

  it('does not fire onSilence while audio stays above the fixed speech threshold', () => {
    fakeCtx.analyser.setRms(MEDIUM_VOICE_RMS_THRESHOLD + 0.1);
    controller.start();

    advanceTimersByMs(DEFAULT_VOICE_PAUSE_DELAY_MS * 3);

    expect(onSilence).not.toHaveBeenCalled();
  });

  it('resets the silence timer when speech interrupts a silence window', () => {
    fakeCtx.analyser.setRms(0);
    controller.start();
    advanceTimersByMs(DEFAULT_VOICE_PAUSE_DELAY_MS - 200);

    fakeCtx.analyser.setRms(MEDIUM_VOICE_RMS_THRESHOLD + 0.1);
    advanceTimersByMs(100);

    fakeCtx.analyser.setRms(0);
    advanceTimersByMs(DEFAULT_VOICE_PAUSE_DELAY_MS - 100);
    expect(onSilence).not.toHaveBeenCalled();

    advanceTimersByMs(200);
    expect(onSilence).toHaveBeenCalledOnce();
  });
});

describe('Voice Activity Detection — pause delay presets', () => {
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

  it('uses a 0.5s to 3.0s slider range with 0.5s snapping and a 1.5s default', () => {
    expect(MIN_VOICE_PAUSE_DELAY_MS).toBe(500);
    expect(MAX_VOICE_PAUSE_DELAY_MS).toBe(3000);
    expect(VOICE_PAUSE_DELAY_STEP_MS).toBe(500);
    expect(DEFAULT_VOICE_PAUSE_DELAY_MS).toBe(1500);
  });

  it('pauses sooner with a 0.5s delay than with a 3.0s delay for the same silent audio', () => {
    const oneSecondController = createVoiceActivityController({
      audioContext: fakeCtx as unknown as AudioContext,
      stream: makeFakeStream(),
      silenceDelayMs: 500,
      onSilence: onSilence as unknown as () => void,
      onSpeech: vi.fn() as unknown as () => void
    });

    const threeSecondOnSilence = vi.fn();
    const threeSecondController = createVoiceActivityController({
      audioContext: fakeCtx as unknown as AudioContext,
      stream: makeFakeStream(),
      silenceDelayMs: 3000,
      onSilence: threeSecondOnSilence as unknown as () => void,
      onSpeech: vi.fn() as unknown as () => void
    });

    fakeCtx.analyser.setRms(0);
    oneSecondController.start();
    threeSecondController.start();

    advanceTimersByMs(1000);

    expect(onSilence).toHaveBeenCalledOnce();
    expect(threeSecondOnSilence).not.toHaveBeenCalled();

    oneSecondController.destroy();
    threeSecondController.destroy();
  });

  it('uses the same speech threshold regardless of the chosen pause delay', () => {
    const oneSecondOnSpeech = vi.fn();
    const oneSecondController = createVoiceActivityController({
      audioContext: fakeCtx as unknown as AudioContext,
      stream: makeFakeStream(),
      silenceDelayMs: 500,
      onSilence: onSilence as unknown as () => void,
      onSpeech: oneSecondOnSpeech as unknown as () => void
    });

    const threeSecondOnSilence = vi.fn();
    const threeSecondOnSpeech = vi.fn();
    const threeSecondController = createVoiceActivityController({
      audioContext: fakeCtx as unknown as AudioContext,
      stream: makeFakeStream(),
      silenceDelayMs: 3000,
      onSilence: threeSecondOnSilence as unknown as () => void,
      onSpeech: threeSecondOnSpeech as unknown as () => void
    });

    fakeCtx.analyser.setRms(0);
    oneSecondController.start();
    threeSecondController.start();
    advanceTimersByMs(3100);

    fakeCtx.analyser.setRms(MEDIUM_VOICE_RMS_THRESHOLD + 0.02);
    advanceTimersByMs(200);

    expect(onSilence).toHaveBeenCalledOnce();
    expect(threeSecondOnSilence).toHaveBeenCalledOnce();
    expect(oneSecondOnSpeech).toHaveBeenCalledOnce();
    expect(threeSecondOnSpeech).toHaveBeenCalledOnce();

    oneSecondController.destroy();
    threeSecondController.destroy();
  });

  it('normalizes free values to the nearest supported slider step', () => {
    expect(normalizeVoicePauseDelayMs(1400)).toBe(1500);
    expect(normalizeVoicePauseDelayMs(2600)).toBe(2500);
    expect(normalizeVoicePauseDelayMs(99999)).toBe(3000);
    expect(normalizeVoicePauseDelayMs(Number.NaN)).toBe(1500);
  });

  it('formats pause delay labels for visible inline values', () => {
    expect(formatVoicePauseDelayLabel(1500, 'en')).toBe('1.5s');
    expect(formatVoicePauseDelayLabel(2000, 'en')).toBe('2s');
  });
});

describe('Voice Activity Detection — lifecycle and cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('destroy() halts polling so onSilence is never called after it', () => {
    const fakeCtx = new FakeAudioContext();
    const onSilence = vi.fn();

    const controller = createVoiceActivityController({
      audioContext: fakeCtx as unknown as AudioContext,
      stream: makeFakeStream(),
      silenceDelayMs: DEFAULT_VOICE_PAUSE_DELAY_MS,
      onSilence,
      onSpeech: vi.fn()
    });

    fakeCtx.analyser.setRms(0);
    controller.start();
    advanceTimersByMs(DEFAULT_VOICE_PAUSE_DELAY_MS / 2);

    controller.destroy();
    advanceTimersByMs(DEFAULT_VOICE_PAUSE_DELAY_MS * 2);

    expect(onSilence).not.toHaveBeenCalled();
  });

  it('destroy() closes the AudioContext', () => {
    const fakeCtx = new FakeAudioContext();
    const controller = createVoiceActivityController({
      audioContext: fakeCtx as unknown as AudioContext,
      stream: makeFakeStream(),
      silenceDelayMs: DEFAULT_VOICE_PAUSE_DELAY_MS,
      onSilence: vi.fn(),
      onSpeech: vi.fn()
    });

    controller.start();
    controller.destroy();

    expect(fakeCtx.state).toBe('closed');
  });

  it('destroy() stops each media stream track', () => {
    const fakeCtx = new FakeAudioContext();
    const fakeTrack = { stop: vi.fn() };
    const fakeStream = { getTracks: () => [fakeTrack] } as unknown as MediaStream;

    const controller = createVoiceActivityController({
      audioContext: fakeCtx as unknown as AudioContext,
      stream: fakeStream,
      silenceDelayMs: DEFAULT_VOICE_PAUSE_DELAY_MS,
      onSilence: vi.fn(),
      onSpeech: vi.fn()
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
      silenceDelayMs: DEFAULT_VOICE_PAUSE_DELAY_MS,
      onSilence: vi.fn(),
      onSpeech: vi.fn()
    });

    controller.start();

    expect(() => {
      controller.destroy();
      controller.destroy();
    }).not.toThrow();
  });
});

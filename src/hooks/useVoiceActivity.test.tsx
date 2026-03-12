import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../store/use-app-store';
import { useVoiceActivity } from './useVoiceActivity';

const voiceActivityMocks = vi.hoisted(() => ({
  createVoiceActivityController: vi.fn()
}));

vi.mock('../lib/voice-activity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/voice-activity')>();
  return {
    ...actual,
    createVoiceActivityController: voiceActivityMocks.createVoiceActivityController
  };
});

function setVadStore(enabled: boolean): void {
  useAppStore.setState({
    vadEnabled: enabled,
    voicePauseDelayMs: 1500
  });
}

describe('useVoiceActivity', () => {
  const originalAudioContext = globalThis.AudioContext;
  const originalMediaDevices = navigator.mediaDevices;

  beforeEach(() => {
    vi.clearAllMocks();
    setVadStore(true);
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'AudioContext', {
      value: originalAudioContext,
      configurable: true
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: originalMediaDevices,
      configurable: true
    });
  });

  it('sets denied runtime status when microphone permission is rejected', async () => {
    Object.defineProperty(globalThis, 'AudioContext', {
      value: vi.fn(),
      configurable: true
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'))
      },
      configurable: true
    });

    const { result } = renderHook(() => useVoiceActivity({
      onSilence: vi.fn(),
      onSpeech: vi.fn()
    }));

    await waitFor(() => {
      expect(result.current.vadRuntimeStatus).toBe('denied');
    });
    expect(result.current.vadState).toBe('off');
    expect(result.current.permissionError).toBe('Microphone access denied.');
    expect(voiceActivityMocks.createVoiceActivityController).not.toHaveBeenCalled();
  });

  it('sets unsupported runtime status when microphone APIs are unavailable', async () => {
    Object.defineProperty(globalThis, 'AudioContext', {
      value: undefined,
      configurable: true
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: undefined,
      configurable: true
    });

    const { result } = renderHook(() => useVoiceActivity({
      onSilence: vi.fn(),
      onSpeech: vi.fn()
    }));

    await waitFor(() => {
      expect(result.current.vadRuntimeStatus).toBe('unsupported');
    });
    expect(result.current.vadState).toBe('off');
    expect(result.current.permissionError).toBe('Voice auto-pause is unavailable on this device.');
    expect(voiceActivityMocks.createVoiceActivityController).not.toHaveBeenCalled();
  });

  it('sets active runtime status after microphone monitoring starts', async () => {
    const stream = {
      getTracks: vi.fn().mockReturnValue([])
    } as unknown as MediaStream;
    const audioContext = {
      close: vi.fn().mockResolvedValue(undefined)
    } as unknown as AudioContext;
    const controller = {
      start: vi.fn(),
      destroy: vi.fn()
    };
    function AudioContextMock() {
      return audioContext;
    }

    Object.defineProperty(globalThis, 'AudioContext', {
      value: AudioContextMock,
      configurable: true
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(stream)
      },
      configurable: true
    });
    voiceActivityMocks.createVoiceActivityController.mockReturnValue(controller);

    const { result } = renderHook(() => useVoiceActivity({
      onSilence: vi.fn(),
      onSpeech: vi.fn()
    }));

    await waitFor(() => {
      expect(result.current.vadRuntimeStatus).toBe('active');
    });
    expect(result.current.vadState).toBe('listening-speaking');
    expect(result.current.permissionError).toBeNull();
    expect(voiceActivityMocks.createVoiceActivityController).toHaveBeenCalledWith(expect.objectContaining({
      audioContext,
      silenceDelayMs: 1500,
      stream
    }));
    expect(controller.start).toHaveBeenCalledTimes(1);
  });
});

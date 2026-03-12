import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getVoiceActivitySupport, requestVoiceActivityStream } from './voice-activity';

const tauriCoreMocks = vi.hoisted(() => ({
  isTauri: vi.fn()
}));

const tauriPermissionMocks = vi.hoisted(() => ({
  requestMicrophonePermission: vi.fn()
}));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: tauriCoreMocks.isTauri
}));

vi.mock('./tauri', () => ({
  requestMicrophonePermission: tauriPermissionMocks.requestMicrophonePermission
}));

describe('voice-activity permission flow', () => {
  const originalAudioContext = globalThis.AudioContext;
  const originalMediaDevices = navigator.mediaDevices;
  const originalPlatform = navigator.platform;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis, 'AudioContext', {
      value: vi.fn(),
      configurable: true
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue('stream')
      },
      configurable: true
    });
    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      configurable: true
    });
    tauriCoreMocks.isTauri.mockReturnValue(false);
    tauriPermissionMocks.requestMicrophonePermission.mockResolvedValue('authorized');
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
    Object.defineProperty(navigator, 'platform', {
      value: originalPlatform,
      configurable: true
    });
  });

  it('keeps support detection independent from native permission prompts', () => {
    expect(getVoiceActivitySupport()).not.toBeNull();
    expect(tauriPermissionMocks.requestMicrophonePermission).not.toHaveBeenCalled();
  });

  it('requests macOS microphone permission natively before getUserMedia in Tauri', async () => {
    tauriCoreMocks.isTauri.mockReturnValue(true);

    const stream = await requestVoiceActivityStream();

    expect(tauriPermissionMocks.requestMicrophonePermission).toHaveBeenCalledTimes(1);
    expect(navigator.mediaDevices?.getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
    expect(stream).toBe('stream');
  });

  it('surfaces a denied macOS permission without calling getUserMedia', async () => {
    tauriCoreMocks.isTauri.mockReturnValue(true);
    tauriPermissionMocks.requestMicrophonePermission.mockResolvedValue('denied');

    await expect(requestVoiceActivityStream()).rejects.toMatchObject({
      name: 'NotAllowedError',
      message: 'Microphone access denied.'
    });
    expect(navigator.mediaDevices?.getUserMedia).not.toHaveBeenCalled();
  });
});

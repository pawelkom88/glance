/**
 * useVoiceActivity — React hook that wraps the VAD controller.
 *
 * Responsibilities:
 *  - Reads/writes voice pause preferences from app state
 *  - Manages the microphone stream lifecycle (request → start → destroy)
 *  - Calls `onSilence` / `onSpeech` callbacks when voice state changes
 *  - Exposes `vadState` (off | listening-silent | listening-speaking) for the UI
 *
 * The hook never modifies playback state directly; the caller decides what to
 * do with the callbacks.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/use-app-store';
import {
  createVoiceActivityController,
  type VoiceActivityController
} from '../lib/voice-activity';

export type VadState = 'off' | 'listening-silent' | 'listening-speaking';
export type VadRuntimeStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'unsupported' | 'error';

export interface UseVoiceActivityOptions {
    /** Called when sustained silence is detected — caller should pause prompter. */
    readonly onSilence: () => void;
    /** Called when speech is detected again after VAD-triggered silence — caller should resume only if it was VAD that paused. */
    readonly onSpeech: () => void;
}

export interface UseVoiceActivityResult {
  readonly vadState: VadState;
  readonly vadRuntimeStatus: VadRuntimeStatus;
  readonly vadEnabled: boolean;
  readonly voicePauseDelayMs: number;
  readonly setVadEnabled: (enabled: boolean) => void;
  readonly setVoicePauseDelayMs: (delayMs: number) => void;
  /** Non-null only when VAD startup or permission handling fails. */
  readonly permissionError: string | null;
}

function classifyVoiceActivityError(error: unknown): {
  readonly permissionError: string;
  readonly runtimeStatus: Exclude<VadRuntimeStatus, 'idle' | 'requesting' | 'active'>;
} {
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

export function useVoiceActivity(options: UseVoiceActivityOptions): UseVoiceActivityResult {
  const { onSilence, onSpeech } = options;

  const vadEnabled = useAppStore((state) => state.vadEnabled);
  const voicePauseDelayMs = useAppStore((state) => state.voicePauseDelayMs);
  const setVadEnabledInStore = useAppStore((state) => state.setVadEnabled);
  const setVoicePauseDelayMsInStore = useAppStore((state) => state.setVoicePauseDelayMs);

  const [vadState, setVadState] = useState<VadState>('off');
  const [vadRuntimeStatus, setVadRuntimeStatus] = useState<VadRuntimeStatus>('idle');
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const controllerRef = useRef<VoiceActivityController | null>(null);
  const onSilenceRef = useRef(onSilence);
  const onSpeechRef = useRef(onSpeech);

  useEffect(() => {
    onSilenceRef.current = onSilence;
    onSpeechRef.current = onSpeech;
  }, [onSilence, onSpeech]);

  useEffect(() => {
    if (!vadEnabled) {
      controllerRef.current?.destroy();
      controllerRef.current = null;
      setVadState('off');
      setVadRuntimeStatus('idle');
      setPermissionError(null);
      return;
    }

    let cancelled = false;

    const start = async () => {
      const AudioContextConstructor = globalThis.AudioContext
        ?? (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      const getUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);

      if (!AudioContextConstructor || !getUserMedia) {
        setPermissionError('Voice auto-pause is unavailable on this device.');
        setVadRuntimeStatus('unsupported');
        setVadState('off');
        return;
      }

      setPermissionError(null);
      setVadRuntimeStatus('requesting');

      try {
        const stream = await getUserMedia({ audio: true, video: false });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const audioContext = new AudioContextConstructor();

        const controller = createVoiceActivityController({
          audioContext,
          stream,
          silenceDelayMs: voicePauseDelayMs,
          onSilence: () => {
            setVadState('listening-silent');
            onSilenceRef.current();
          },
          onSpeech: () => {
            setVadState('listening-speaking');
            onSpeechRef.current();
          }
        });

        controllerRef.current = controller;
        setVadState('listening-speaking');
        setVadRuntimeStatus('active');
        setPermissionError(null);
        controller.start();
      } catch (err) {
        if (cancelled) {
          return;
        }
        const { permissionError: nextPermissionError, runtimeStatus } = classifyVoiceActivityError(err);
        setPermissionError(nextPermissionError);
        setVadRuntimeStatus(runtimeStatus);
        setVadState('off');
      }
    };

    void start();

    return () => {
      cancelled = true;
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, [vadEnabled, voicePauseDelayMs]);

  const setVadEnabled = useCallback((enabled: boolean) => {
    setVadEnabledInStore(enabled);
  }, [setVadEnabledInStore]);

  const setVoicePauseDelayMs = useCallback((delayMs: number) => {
    setVoicePauseDelayMsInStore(delayMs);
  }, [setVoicePauseDelayMsInStore]);

  return {
    vadState,
    vadRuntimeStatus,
    vadEnabled,
    voicePauseDelayMs,
    setVadEnabled,
    setVoicePauseDelayMs,
    permissionError
  };
}

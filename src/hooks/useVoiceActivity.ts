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

export interface UseVoiceActivityOptions {
    /** Called when sustained silence is detected — caller should pause prompter. */
    readonly onSilence: () => void;
    /** Called when speech is detected again after VAD-triggered silence — caller should resume only if it was VAD that paused. */
    readonly onSpeech: () => void;
}

export interface UseVoiceActivityResult {
  readonly vadState: VadState;
  readonly vadEnabled: boolean;
  readonly voicePauseDelayMs: number;
  readonly setVadEnabled: (enabled: boolean) => void;
  readonly setVoicePauseDelayMs: (delayMs: number) => void;
  /** Non-null only while VAD is active and awaiting mic permission. */
  readonly permissionError: string | null;
}

export function useVoiceActivity(options: UseVoiceActivityOptions): UseVoiceActivityResult {
  const { onSilence, onSpeech } = options;

  const vadEnabled = useAppStore((state) => state.vadEnabled);
  const voicePauseDelayMs = useAppStore((state) => state.voicePauseDelayMs);
  const setVadEnabledInStore = useAppStore((state) => state.setVadEnabled);
  const setVoicePauseDelayMsInStore = useAppStore((state) => state.setVoicePauseDelayMs);

  const [vadState, setVadState] = useState<VadState>('off');
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
      setPermissionError(null);
      return;
    }

    let cancelled = false;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const audioContext = new AudioContext();

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
        setPermissionError(null);
        controller.start();
      } catch (err) {
        if (cancelled) {
          return;
        }
        const message = err instanceof Error ? err.message : 'Microphone access denied';
        setPermissionError(message);
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
    vadEnabled,
    voicePauseDelayMs,
    setVadEnabled,
    setVoicePauseDelayMs,
    permissionError
  };
}

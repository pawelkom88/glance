/**
 * useVoiceSync — React hook that coordinates Speechmatics STT streaming
 * with script following and teleprompter auto-scrolling.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store/use-app-store';
import {
  createSpeechmaticsRealtimeClient,
  type SpeechmaticsClient,
  type SpeechmaticsClientStatus,
  type SpeechmaticsWord
} from '../lib/speechmatics';
import {
  createVoiceSyncFollower,
  extractScriptWords,
  groupScriptWordsByLine,
  type ScriptWord,
  type VoiceSyncFollower,
  type WordMatchEvent
} from '../lib/voice-sync-follower';
import type { DisplayLine } from '../types';

export type VoiceSyncRuntimeState =
  | 'off'
  | 'missing-key'
  | 'authorizing'
  | 'connecting'
  | 'listening'
  | 'syncing'
  | 'error';

export interface UseVoiceSyncOptions {
  readonly lines: readonly DisplayLine[];
  readonly linePositions: { positions: readonly number[]; heights?: readonly number[]; totalHeight: number };
  readonly lineRefs: React.MutableRefObject<Array<HTMLElement | null>>;
  readonly lanePadding: number;
  readonly firstLineLaneNudge: number;
  readonly playbackState: 'paused' | 'running';
  readonly onTargetScrollChange: (targetScrollY: number) => void;
}

export interface UseVoiceSyncResult {
  readonly voiceSyncState: VoiceSyncRuntimeState;
  readonly voiceSyncEnabled: boolean;
  readonly hasApiKey: boolean;
  readonly activeSpokenWord: string | null;
  readonly activeMatchedLineIndex: number | null;
  readonly activeMatchedWordIndex: number | null;
  readonly wordsByLine: Map<number, ScriptWord[]>;
  readonly errorMessage: string | null;
  readonly repositionToLine: (lineIndex: number) => void;
  readonly syncCurrentScroll: (pos: number) => void;
}

export function useVoiceSync(options: UseVoiceSyncOptions): UseVoiceSyncResult {
  const {
    lines,
    linePositions,
    lineRefs,
    lanePadding,
    firstLineLaneNudge,
    playbackState,
    onTargetScrollChange
  } = options;

  const voiceSyncEnabled = useAppStore((state) => state.voiceSyncEnabled);
  const speechmaticsApiKey = useAppStore((state) => state.speechmaticsApiKey);
  const appLanguage = useAppStore((state) => state.language);

  const [voiceSyncState, setVoiceSyncState] = useState<VoiceSyncRuntimeState>('off');
  const [activeSpokenWord, setActiveSpokenWord] = useState<string | null>(null);
  const [activeMatchedLineIndex, setActiveMatchedLineIndex] = useState<number | null>(null);
  const [activeMatchedWordIndex, setActiveMatchedWordIndex] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clientRef = useRef<SpeechmaticsClient | null>(null);
  const followerRef = useRef<VoiceSyncFollower | null>(null);
  const syncingTimeoutRef = useRef<number | null>(null);
  const onTargetScrollChangeRef = useRef(onTargetScrollChange);
  const targetScrollYRef = useRef<number | null>(null);
  const currentScrollYRef = useRef<number>(useAppStore.getState().scrollPosition);

  useEffect(() => {
    onTargetScrollChangeRef.current = onTargetScrollChange;
  }, [onTargetScrollChange]);

  const wordsByLine = useMemo(() => {
    return groupScriptWordsByLine(extractScriptWords(lines));
  }, [lines]);

  const syncCurrentScroll = useCallback((pos: number) => {
    currentScrollYRef.current = pos;
    targetScrollYRef.current = pos;
    // eslint-disable-next-line no-console
    console.log(`[VoiceSync:Scroll] 📍 Resynced scroll to ${Math.round(pos)}px`);
  }, []);

  // Continuous smooth damped spring physics animation loop (Promptmatics inertial glide)
  useEffect(() => {
    if (!voiceSyncEnabled || playbackState !== 'running') {
      return;
    }

    currentScrollYRef.current = useAppStore.getState().scrollPosition;
    let animId: number;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      if (targetScrollYRef.current !== null) {
        const current = currentScrollYRef.current;
        const target = targetScrollYRef.current;
        const diff = target - current;

        if (Math.abs(diff) > 0.1) {
          // Responsive exponential spring damping (decay factor 7.5 for low-latency fluid tracking)
          const next = current + diff * (1 - Math.exp(-dt * 7.5));
          currentScrollYRef.current = next;
          onTargetScrollChangeRef.current(next);
        }
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(animId);
    };
  }, [playbackState, voiceSyncEnabled]);

  // Re-create script follower when lines change
  useEffect(() => {
    followerRef.current = createVoiceSyncFollower({
      lines,
      onMatch: (event: WordMatchEvent) => {
        setActiveSpokenWord(event.spokenWord);
        setActiveMatchedLineIndex(event.lineIndex);
        setActiveMatchedWordIndex(event.globalIndex);

        // Calculate smooth progressive intra-line target scroll Y
        const node = lineRefs.current[event.lineIndex];
        const nextNode = lineRefs.current[event.lineIndex + 1];
        const effectivePadding = Math.max(0, lanePadding + firstLineLaneNudge);
        const lineY = node
          ? Math.max(0, node.offsetTop - effectivePadding)
          : (linePositions.positions[event.lineIndex] ?? 0);

        let targetY = lineY;
        if (event.scriptWord.totalWordsInLine > 1) {
          const nextLineY = nextNode
            ? Math.max(0, nextNode.offsetTop - effectivePadding)
            : (linePositions.positions[event.lineIndex + 1] ?? (lineY + (linePositions.heights?.[event.lineIndex] || 60)));
          const fraction = event.scriptWord.wordIndexInLine / event.scriptWord.totalWordsInLine;
          targetY = lineY + fraction * Math.max(0, nextLineY - lineY);
        }

        const prevTarget = targetScrollYRef.current;
        if (targetScrollYRef.current === null) {
          targetScrollYRef.current = targetY;
        } else {
          // Monotonically advance to prevent jitter from partial audio revisions
          const delta = targetY - targetScrollYRef.current;
          if (delta >= -2) {
            targetScrollYRef.current = Math.max(targetScrollYRef.current, targetY);
          } else if (Math.abs(delta) > 150) {
            // Speaker jumped section or line
            targetScrollYRef.current = targetY;
          }
        }

        // eslint-disable-next-line no-console
        console.log(
          `[VoiceSync:Scroll] 📐 Line ${event.lineIndex} (word ${event.scriptWord.wordIndexInLine + 1}/${event.scriptWord.totalWordsInLine}) -> targetY: ${Math.round(targetY)}px (prevTarget: ${prevTarget !== null ? Math.round(prevTarget) : 'none'}px, current: ${Math.round(currentScrollYRef.current)}px)`
        );

        setVoiceSyncState('syncing');
        if (syncingTimeoutRef.current !== null) {
          window.clearTimeout(syncingTimeoutRef.current);
        }
        syncingTimeoutRef.current = window.setTimeout(() => {
          setVoiceSyncState((current) => (current === 'syncing' ? 'listening' : current));
          syncingTimeoutRef.current = null;
        }, 500);
      }
    });
  }, [firstLineLaneNudge, lanePadding, linePositions.heights, linePositions.positions, lineRefs, lines]);

  // Manage client lifecycle
  useEffect(() => {
    if (!voiceSyncEnabled) {
      clientRef.current?.stop();
      clientRef.current = null;
      setVoiceSyncState('off');
      setErrorMessage(null);
      setActiveSpokenWord(null);
      setActiveMatchedLineIndex(null);
      setActiveMatchedWordIndex(null);
      followerRef.current?.reset();
      return;
    }

    if (!speechmaticsApiKey || !speechmaticsApiKey.trim()) {
      clientRef.current?.stop();
      clientRef.current = null;
      setVoiceSyncState('missing-key');
      setErrorMessage('Speechmatics API key missing');
      return;
    }

    if (playbackState !== 'running') {
      clientRef.current?.stop();
      clientRef.current = null;
      setVoiceSyncState('listening');
      return;
    }

    setErrorMessage(null);
    setVoiceSyncState('authorizing');

    const client = createSpeechmaticsRealtimeClient({
      apiKey: speechmaticsApiKey,
      language: appLanguage || 'en',
      onWord: (word: SpeechmaticsWord) => {
        followerRef.current?.processSpokenWord(word.word, word.isPartial);
      },
      onStatusChange: (status: SpeechmaticsClientStatus, errorMsg?: string | null) => {
        if (status === 'authorizing') setVoiceSyncState('authorizing');
        else if (status === 'connecting') setVoiceSyncState('connecting');
        else if (status === 'listening') setVoiceSyncState('listening');
        else if (status === 'error') {
          setVoiceSyncState('error');
          if (errorMsg) {
            setErrorMessage(errorMsg);
            useAppStore.getState().showToast(errorMsg, 'error');
          }
        }
      },
      onError: (err: string) => {
        setVoiceSyncState('error');
        setErrorMessage(err);
        useAppStore.getState().showToast(err, 'error');
      }
    });

    clientRef.current = client;
    void client.start();

    return () => {
      if (syncingTimeoutRef.current !== null) {
        window.clearTimeout(syncingTimeoutRef.current);
      }
      client.stop();
      clientRef.current = null;
    };
  }, [appLanguage, playbackState, speechmaticsApiKey, voiceSyncEnabled]);

  const repositionToLine = useCallback((lineIndex: number) => {
    followerRef.current?.setCursorToLine(lineIndex);
  }, []);

  return {
    voiceSyncState,
    voiceSyncEnabled,
    hasApiKey: Boolean(speechmaticsApiKey && speechmaticsApiKey.trim().length > 0),
    activeSpokenWord,
    activeMatchedLineIndex,
    activeMatchedWordIndex,
    wordsByLine,
    errorMessage,
    repositionToLine,
    syncCurrentScroll
  };
}

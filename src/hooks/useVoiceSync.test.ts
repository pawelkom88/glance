import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceSync } from './useVoiceSync';
import { useAppStore } from '../store/use-app-store';
import type { DisplayLine } from '../types';

vi.mock('../lib/speechmatics', () => ({
  createSpeechmaticsRealtimeClient: vi.fn().mockImplementation((options) => ({
    start: vi.fn().mockImplementation(async () => {
      options.onStatusChange('listening');
    }),
    stop: vi.fn().mockImplementation(() => {
      options.onStatusChange('stopped');
    }),
    getStatus: () => 'listening'
  }))
}));

describe('useVoiceSync', () => {
  beforeEach(() => {
    useAppStore.setState({
      voiceSyncEnabled: false,
      speechmaticsApiKey: '',
      language: 'en'
    });
  });

  it('returns off state when voiceSyncEnabled is false', () => {
    const lines: DisplayLine[] = [
      { id: '1', kind: 'text', text: 'Hello world', sectionIndex: 0 }
    ];

    const { result } = renderHook(() =>
      useVoiceSync({
        lines,
        linePositions: { positions: [0], totalHeight: 50 },
        lineRefs: { current: [] },
        lanePadding: 40,
        firstLineLaneNudge: 0,
        playbackState: 'paused',
        onTargetScrollChange: vi.fn()
      })
    );

    expect(result.current.voiceSyncState).toBe('off');
    expect(result.current.hasApiKey).toBe(false);
  });

  it('returns missing-key when voiceSyncEnabled is true but no key provided', () => {
    useAppStore.setState({
      voiceSyncEnabled: true,
      speechmaticsApiKey: ''
    });

    const lines: DisplayLine[] = [
      { id: '1', kind: 'text', text: 'Hello world', sectionIndex: 0 }
    ];

    const { result } = renderHook(() =>
      useVoiceSync({
        lines,
        linePositions: { positions: [0], totalHeight: 50 },
        lineRefs: { current: [] },
        lanePadding: 40,
        firstLineLaneNudge: 0,
        playbackState: 'paused',
        onTargetScrollChange: vi.fn()
      })
    );

    expect(result.current.voiceSyncState).toBe('missing-key');
    expect(result.current.hasApiKey).toBe(false);
  });

  it('starts streaming and reaches listening state when key is configured and playback runs', async () => {
    useAppStore.setState({
      voiceSyncEnabled: true,
      speechmaticsApiKey: 'valid-api-key'
    });

    const lines: DisplayLine[] = [
      { id: '1', kind: 'text', text: 'Hello world', sectionIndex: 0 }
    ];

    const { result } = renderHook(() =>
      useVoiceSync({
        lines,
        linePositions: { positions: [0], totalHeight: 50 },
        lineRefs: { current: [] },
        lanePadding: 40,
        firstLineLaneNudge: 0,
        playbackState: 'running',
        onTargetScrollChange: vi.fn()
      })
    );

    expect(result.current.hasApiKey).toBe(true);
    expect(result.current.voiceSyncState).toBe('listening');
  });

  it('matches spoken words, tracks active word index, and handles repositionToLine', async () => {
    useAppStore.setState({
      voiceSyncEnabled: true,
      speechmaticsApiKey: 'valid-api-key'
    });

    const lines: DisplayLine[] = [
      { id: '1', kind: 'text', text: 'Welcome everyone to Glance', sectionIndex: 0 },
      { id: '2', kind: 'text', text: 'Second line here', sectionIndex: 1 }
    ];

    let onWordCallback: ((word: { word: string; isPartial?: boolean }) => void) | null = null;
    const { createSpeechmaticsRealtimeClient } = await import('../lib/speechmatics');
    vi.mocked(createSpeechmaticsRealtimeClient).mockImplementationOnce((opts: any) => {
      onWordCallback = opts.onWord;
      return {
        start: vi.fn().mockImplementation(async () => {
          opts.onStatusChange('listening');
        }),
        stop: vi.fn(),
        getStatus: () => 'listening'
      };
    });

    const onTargetScrollChange = vi.fn();
    const { result } = renderHook(() =>
      useVoiceSync({
        lines,
        linePositions: { positions: [0, 60], totalHeight: 120 },
        lineRefs: { current: [] },
        lanePadding: 40,
        firstLineLaneNudge: 0,
        playbackState: 'running',
        onTargetScrollChange
      })
    );

    expect(result.current.activeMatchedWordIndex).toBeNull();

    // Simulate speechmatics sending first word
    act(() => {
      onWordCallback?.({ word: 'Welcome', isPartial: false });
    });

    expect(result.current.activeSpokenWord).toBe('Welcome');
    expect(result.current.activeMatchedWordIndex).toBe(0);
    expect(result.current.activeMatchedLineIndex).toBe(0);

    // Simulate next word
    act(() => {
      onWordCallback?.({ word: 'everyone', isPartial: false });
    });

    expect(result.current.activeSpokenWord).toBe('everyone');
    expect(result.current.activeMatchedWordIndex).toBe(1);

    // Reposition back to line 0
    act(() => {
      result.current.repositionToLine(0);
    });

    expect(result.current.activeMatchedWordIndex).toBeNull();
    expect(result.current.activeSpokenWord).toBeNull();

    // Test syncCurrentScroll
    act(() => {
      result.current.syncCurrentScroll(120);
    });

    // Test repositioning to line 1 (no stale word or active highlight before speaking)
    act(() => {
      result.current.repositionToLine(1);
    });

    expect(result.current.activeMatchedWordIndex).toBeNull();
    expect(result.current.activeSpokenWord).toBeNull();
    expect(result.current.followerCursorIndex).toBe(4);
    expect(result.current.wordsByLine.size).toBe(2);
  });

  it('does not reset follower cursor when lanePadding changes (e.g. window resize)', async () => {
    useAppStore.setState({
      voiceSyncEnabled: true,
      speechmaticsApiKey: 'valid-api-key'
    });

    const lines: DisplayLine[] = [
      { id: '1', kind: 'text', text: 'Alpha beta gamma delta', sectionIndex: 0 },
      { id: '2', kind: 'text', text: 'Epsilon zeta eta theta', sectionIndex: 1 }
    ];

    let onWordCallback: ((word: { word: string; isPartial?: boolean }) => void) | null = null;
    const { createSpeechmaticsRealtimeClient } = await import('../lib/speechmatics');
    vi.mocked(createSpeechmaticsRealtimeClient).mockImplementationOnce((opts: any) => {
      onWordCallback = opts.onWord;
      return {
        start: vi.fn().mockImplementation(async () => {
          opts.onStatusChange('listening');
        }),
        stop: vi.fn(),
        getStatus: () => 'listening'
      };
    });

    const onTargetScrollChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ lanePadding }) =>
        useVoiceSync({
          lines,
          linePositions: { positions: [0, 60], totalHeight: 120 },
          lineRefs: { current: [] },
          lanePadding,
          firstLineLaneNudge: 0,
          playbackState: 'running',
          onTargetScrollChange
        }),
      { initialProps: { lanePadding: 40 } }
    );

    // Speak first two words
    act(() => {
      onWordCallback?.({ word: 'Alpha', isPartial: false });
    });
    act(() => {
      onWordCallback?.({ word: 'beta', isPartial: false });
    });

    expect(result.current.activeMatchedWordIndex).toBe(1);
    expect(result.current.followerCursorIndex).toBe(2);

    // Simulate window resize changing lanePadding from 40 to 80
    rerender({ lanePadding: 80 });

    // Verify cursor did not get wiped to 0
    expect(result.current.activeMatchedWordIndex).toBe(1);
    expect(result.current.followerCursorIndex).toBe(2);

    // Next spoken word should match gamma (word index 2), NOT restart from Alpha
    act(() => {
      onWordCallback?.({ word: 'gamma', isPartial: false });
    });
    expect(result.current.activeMatchedWordIndex).toBe(2);
    expect(result.current.activeSpokenWord).toBe('gamma');
  });

  it('handles repeated words in adjacent lines without jumping ahead prematurely', async () => {
    useAppStore.setState({
      voiceSyncEnabled: true,
      speechmaticsApiKey: 'valid-api-key'
    });

    const lines: DisplayLine[] = [
      { id: '1', kind: 'text', text: 'Welcome to the studio today', sectionIndex: 0 },
      { id: '2', kind: 'text', text: 'We hope to see you again', sectionIndex: 1 }
    ];

    let onWordCallback: ((word: { word: string; isPartial?: boolean }) => void) | null = null;
    const { createSpeechmaticsRealtimeClient } = await import('../lib/speechmatics');
    vi.mocked(createSpeechmaticsRealtimeClient).mockImplementationOnce((opts: any) => {
      onWordCallback = opts.onWord;
      return {
        start: vi.fn().mockImplementation(async () => {
          opts.onStatusChange('listening');
        }),
        stop: vi.fn(),
        getStatus: () => 'listening'
      };
    });

    const onTargetScrollChange = vi.fn();
    const { result } = renderHook(() =>
      useVoiceSync({
        lines,
        linePositions: { positions: [0, 60], totalHeight: 120 },
        lineRefs: { current: [] },
        lanePadding: 40,
        firstLineLaneNudge: 0,
        playbackState: 'running',
        onTargetScrollChange
      })
    );

    // Speak "Welcome" (word 0) and "to" (word 1)
    act(() => {
      onWordCallback?.({ word: 'Welcome', isPartial: false });
    });
    expect(result.current.activeMatchedWordIndex).toBe(0);

    act(() => {
      onWordCallback?.({ word: 'to', isPartial: false });
    });
    expect(result.current.activeMatchedWordIndex).toBe(1);
    expect(result.current.followerCursorIndex).toBe(2);

    // Speaker repeats "to"
    act(() => {
      onWordCallback?.({ word: 'to', isPartial: false });
    });
    // Must NOT leap forward to line 2 word "to" (globalIndex 7)
    expect(result.current.activeMatchedWordIndex).toBe(1);
    expect(result.current.followerCursorIndex).toBe(2);

    // Speaker continues with "the" (word 2)
    act(() => {
      onWordCallback?.({ word: 'the', isPartial: false });
    });
    expect(result.current.activeMatchedWordIndex).toBe(2);
    expect(result.current.followerCursorIndex).toBe(3);
  });

  it('keeps scroll target on current line when Speechmatics re-emits partial clauses across lines with shared words', async () => {
    useAppStore.setState({
      voiceSyncEnabled: true,
      speechmaticsApiKey: 'valid-api-key'
    });

    const lines: DisplayLine[] = [
      { id: '1', kind: 'text', text: 'We will review the first draft today', sectionIndex: 0 },
      { id: '2', kind: 'text', text: 'We will discuss the next steps tomorrow', sectionIndex: 1 }
    ];

    let onWordCallback: ((word: { word: string; isPartial?: boolean }) => void) | null = null;
    const { createSpeechmaticsRealtimeClient } = await import('../lib/speechmatics');
    vi.mocked(createSpeechmaticsRealtimeClient).mockImplementationOnce((opts: any) => {
      onWordCallback = opts.onWord;
      return {
        start: vi.fn().mockImplementation(async () => {
          opts.onStatusChange('listening');
        }),
        stop: vi.fn(),
        getStatus: () => 'listening'
      };
    });

    const onTargetScrollChange = vi.fn();
    const { result } = renderHook(() =>
      useVoiceSync({
        lines,
        linePositions: { positions: [0, 60], totalHeight: 120 },
        lineRefs: { current: [] },
        lanePadding: 40,
        firstLineLaneNudge: 0,
        playbackState: 'running',
        onTargetScrollChange
      })
    );

    // Partial 1: ["We"]
    act(() => {
      onWordCallback?.({ word: 'We', isPartial: true });
    });
    expect(result.current.activeMatchedWordIndex).toBe(0);
    expect(result.current.activeMatchedLineIndex).toBe(0);

    // Partial 2: ["We", "will"]
    act(() => {
      onWordCallback?.({ word: 'We', isPartial: true });
      onWordCallback?.({ word: 'will', isPartial: true });
    });
    expect(result.current.activeMatchedWordIndex).toBe(1);
    expect(result.current.activeMatchedLineIndex).toBe(0);

    // Partial 3: ["We", "will", "review"]
    act(() => {
      onWordCallback?.({ word: 'We', isPartial: true });
      onWordCallback?.({ word: 'will', isPartial: true });
      onWordCallback?.({ word: 'review', isPartial: true });
    });
    // Active word MUST remain on line 0 (word 2: "review"), NOT leaped to line 1 (word 8: "will")
    expect(result.current.activeMatchedWordIndex).toBe(2);
    expect(result.current.activeMatchedLineIndex).toBe(0);
    expect(result.current.followerCursorIndex).toBe(3);
  });
});

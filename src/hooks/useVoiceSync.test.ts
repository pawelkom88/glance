import { renderHook } from '@testing-library/react';
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
});

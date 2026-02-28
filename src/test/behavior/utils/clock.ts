import { vi } from 'vitest';

export function withFakeNow(start = 0): {
  readonly advance: (ms: number) => void;
  readonly restore: () => void;
} {
  let now = start;
  const spy = vi.spyOn(performance, 'now').mockImplementation(() => now);

  return {
    advance: (ms: number) => {
      now += ms;
      vi.advanceTimersByTime(ms);
    },
    restore: () => {
      spy.mockRestore();
    }
  };
}

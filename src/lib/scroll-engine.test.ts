import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScrollEngine } from './scroll-engine';

describe('ScrollEngine behavior', () => {
  let frameId = 0;
  let queuedFrames: Array<(timestamp: number) => void> = [];
  let requestAnimationFrameSpy: ReturnType<typeof vi.fn>;
  let cancelAnimationFrameSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    queuedFrames = [];
    frameId = 0;
    requestAnimationFrameSpy = vi.fn((callback: (timestamp: number) => void) => {
      queuedFrames.push(callback);
      frameId += 1;
      return frameId;
    });
    cancelAnimationFrameSpy = vi.fn();

    vi.stubGlobal('requestAnimationFrame', requestAnimationFrameSpy);
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameSpy);
  });

  it('supports play, pause, and destroy lifecycle transitions', () => {
    const onTick = vi.fn();
    const engine = new ScrollEngine({
      getSpeed: () => 42,
      onTick
    });

    engine.play();
    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);

    engine.pause();
    expect(cancelAnimationFrameSpy).toHaveBeenCalledTimes(1);

    engine.destroy();
    expect(cancelAnimationFrameSpy).toHaveBeenCalledTimes(1);
  });

  it('clamps setPosition at zero and advances position on ticks', () => {
    const onTick = vi.fn();
    const engine = new ScrollEngine({
      getSpeed: () => 42,
      onTick
    });

    engine.setPosition(-25);
    expect(engine.currentPosition()).toBe(0);
    expect(onTick).toHaveBeenLastCalledWith(0);

    engine.play();
    queuedFrames.shift()?.(1000);
    queuedFrames.shift()?.(2000);

    expect(engine.currentPosition()).toBe(42);
    expect(onTick).toHaveBeenLastCalledWith(42);
  });

  it('ignores duplicate play calls while already running', () => {
    const engine = new ScrollEngine({
      getSpeed: () => 42,
      onTick: () => undefined
    });

    engine.play();
    engine.play();

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
  });
});

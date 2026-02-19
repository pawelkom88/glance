interface ScrollEngineOptions {
  readonly getSpeed: () => number;
  readonly onTick: (nextPosition: number) => void;
}

export class ScrollEngine {
  private animationFrame: number | null = null;
  private lastTimestamp = 0;
  private running = false;
  private position = 0;
  private readonly getSpeed: () => number;
  private readonly onTick: (nextPosition: number) => void;

  public constructor(options: ScrollEngineOptions) {
    this.getSpeed = options.getSpeed;
    this.onTick = options.onTick;
  }

  public setPosition(value: number): void {
    this.position = Math.max(0, value);
    this.onTick(this.position);
  }

  public currentPosition(): number {
    return this.position;
  }

  public play(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.lastTimestamp = 0;
    this.animationFrame = window.requestAnimationFrame(this.step);
  }

  public pause(): void {
    this.running = false;
    if (this.animationFrame !== null) {
      window.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  public destroy(): void {
    this.pause();
  }

  private readonly step = (timestamp: number): void => {
    if (!this.running) {
      return;
    }

    if (this.lastTimestamp === 0) {
      this.lastTimestamp = timestamp;
    }

    const deltaSeconds = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    this.position += this.getSpeed() * deltaSeconds;
    this.onTick(this.position);
    this.animationFrame = window.requestAnimationFrame(this.step);
  };
}

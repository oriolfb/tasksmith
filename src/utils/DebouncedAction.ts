export class DebouncedAction {
  private timer: number | null = null;

  constructor(private readonly delay: number) {}

  schedule(action: () => void): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      action();
    }, this.delay);
  }
}

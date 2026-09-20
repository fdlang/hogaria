export class ExclusiveAction {
  private running = false;

  async run(action: () => Promise<unknown>): Promise<boolean> {
    if (this.running) return false;
    this.running = true;
    try {
      await action();
      return true;
    } finally {
      this.running = false;
    }
  }
}

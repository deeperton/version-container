/**
 * Minimal asynchronous mutex to serialize access to shared resources.
 */
export class AsyncMutex {
  private queue: Promise<void> = Promise.resolve();

  /**
   * Executes the provided function once the mutex is acquired.
   * The mutex is released when the returned promise settles.
   *
   * @param task - The task to run while holding the mutex.
   * @returns The value produced by the task.
   */
  async runExclusive<Value>(task: () => Promise<Value>): Promise<Value> {
    let release: () => void = () => {
      // no-op placeholder; will be replaced below
    };

    const waitForTurn = this.queue;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await waitForTurn;

    try {
      return await task();
    } finally {
      release();
    }
  }
}

/** A queue that runs at most a fixed number of decodes at once. */
export interface DecodeQueue {
  /**
   * Runs `task` when a slot is free, and returns what it returns.
   *
   * Fails without running `task` if `signal` aborts before a slot is free.
   */
  run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T>;
}

interface Waiting {
  readonly start: () => void;
  readonly signal: AbortSignal | undefined;
}

/** Returns a queue that runs at most `limit` tasks at once, in the order they arrive. */
export function createDecodeQueue(limit: number): DecodeQueue {
  let running = 0;
  let waiting: Waiting[] = [];

  const next = () => {
    while (running < limit) {
      const head = waiting.shift();
      if (head === undefined) return;
      if (head.signal?.aborted) continue;

      head.start();
    }
  };

  return {
    run(task, signal) {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(signal.reason);
          return;
        }

        const entry: Waiting = {
          signal,
          start() {
            signal?.removeEventListener("abort", onAbort);
            running += 1;
            task()
              .then(resolve, reject)
              .finally(() => {
                running -= 1;
                next();
              });
          },
        };
        const onAbort = () => {
          waiting = waiting.filter((each) => each !== entry);
          reject(signal?.reason);
        };

        signal?.addEventListener("abort", onAbort, { once: true });
        waiting.push(entry);
        next();
      });
    },
  };
}

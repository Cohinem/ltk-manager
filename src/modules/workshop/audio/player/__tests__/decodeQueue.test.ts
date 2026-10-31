import { describe, expect, it } from "vitest";

import { createDecodeQueue } from "../decodeQueue";

/** A task that a test settles by hand, which records when it starts. */
function deferred(log: string[], name: string) {
  let settle: { resolve: (value: string) => void; reject: (error: Error) => void } | null = null;
  const task = () => {
    log.push(name);
    return new Promise<string>((resolve, reject) => {
      settle = { resolve, reject };
    });
  };
  return {
    task,
    resolve: () => settle?.resolve(name),
    reject: () => settle?.reject(new Error(name)),
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createDecodeQueue", () => {
  it("runs no more tasks at once than its limit, and starts the next when one settles", async () => {
    const queue = createDecodeQueue(2);
    const log: string[] = [];
    const [a, b, c] = ["a", "b", "c"].map((name) => deferred(log, name));

    const results = [queue.run(a.task), queue.run(b.task), queue.run(c.task)];
    expect(log).toEqual(["a", "b"]);

    a.resolve();
    await tick();
    expect(log).toEqual(["a", "b", "c"]);

    b.resolve();
    c.resolve();
    await expect(Promise.all(results)).resolves.toEqual(["a", "b", "c"]);
  });

  it("starts the next task when one fails", async () => {
    const queue = createDecodeQueue(1);
    const log: string[] = [];
    const [a, b] = ["a", "b"].map((name) => deferred(log, name));

    const first = queue.run(a.task);
    void queue.run(b.task);

    a.reject();
    await expect(first).rejects.toThrow("a");
    await tick();
    expect(log).toEqual(["a", "b"]);
  });

  it("skips a waiting task whose signal aborts, and never starts it", async () => {
    const queue = createDecodeQueue(1);
    const log: string[] = [];
    const [a, b, c] = ["a", "b", "c"].map((name) => deferred(log, name));
    const abort = new AbortController();

    void queue.run(a.task);
    const skipped = queue.run(b.task, abort.signal);
    void queue.run(c.task);

    abort.abort();
    await expect(skipped).rejects.toThrow();

    a.resolve();
    await tick();
    expect(log).toEqual(["a", "c"]);
  });

  it("rejects a task whose signal aborted before it was queued", async () => {
    const queue = createDecodeQueue(1);
    const log: string[] = [];
    const a = deferred(log, "a");

    await expect(queue.run(a.task, AbortSignal.abort())).rejects.toThrow();
    expect(log).toEqual([]);
  });
});

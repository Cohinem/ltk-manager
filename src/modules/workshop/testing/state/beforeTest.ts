import { useEffect, useRef } from "react";

/** A write that a Test waits for, which resolves once it landed and rejects if it failed. */
export type BeforeTest = () => Promise<unknown>;

/** The writes a Test waits for, by the id of whatever offers each. */
const writes = new Map<string, () => Promise<unknown>>();

/**
 * Offers `write` while mounted, so a Test writes it before the overlay is built. A null
 * `write` offers nothing. `write` is read at call time, so a fresh closure registers once.
 */
export function useBeforeTest(id: string, write: BeforeTest | null): void {
  const current = useRef(write);
  useEffect(() => {
    current.current = write;
  });

  const offered = write !== null;
  useEffect(() => {
    if (!offered) return;

    const run = () => current.current?.() ?? Promise.resolve();
    writes.set(id, run);
    return () => {
      if (writes.get(id) === run) writes.delete(id);
    };
  }, [id, offered]);
}

/** Runs every write offered to a Test. Rejects with the first failure. */
export async function writeBeforeTest(): Promise<void> {
  await Promise.all([...writes.values()].map((write) => write()));
}

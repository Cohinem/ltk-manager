// @vitest-environment happy-dom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { VfxRun } from "../run";
import { useRunReadout } from "../runReadout";
import { fakeRun } from "./fakeRun";

let level = 0;
const readLevel = () => level;

function Readout({ run, name }: { run: VfxRun; name: string }) {
  return <span data-testid={name}>{useRunReadout(run, readLevel)}</span>;
}

beforeEach(() => {
  vi.useFakeTimers();
  level = 0;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useRunReadout", () => {
  it("hears a run once for all its readouts, updates them together, and stops with the last", () => {
    const { run: base, tick } = fakeRun();
    const unsubscribe = vi.fn();
    const subscribe = vi.fn((listener: () => void) => {
      const off = base.subscribe(listener);
      return () => {
        unsubscribe();
        off();
      };
    });
    const run = { ...base, subscribe };
    const view = render(
      <>
        <Readout run={run} name="first" />
        <Readout run={run} name="second" />
      </>,
    );

    level = 0.5;
    act(() => {
      tick();
      vi.advanceTimersByTime(100);
    });

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("first").textContent).toBe("0.5");
    expect(screen.getByTestId("second").textContent).toBe("0.5");

    view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

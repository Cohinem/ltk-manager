import { afterEach, describe, expect, it, vi } from "vitest";

import { quietReactPerformanceTracks } from "../reactPerformanceTracks";

const original = { timeStamp: console.timeStamp, measure: performance.measure };

afterEach(() => {
  console.timeStamp = original.timeStamp;
  performance.measure = original.measure;
});

describe("quietReactPerformanceTracks", () => {
  it("drops React's track entries and passes every other timing call through", () => {
    const timeStamp = vi.fn();
    const measure = vi.fn();
    console.timeStamp = timeStamp;
    performance.measure = measure as unknown as typeof performance.measure;

    quietReactPerformanceTracks();
    /* React passes the track arguments of the extended `console.timeStamp`, which the DOM types lack. */
    const stamp = console.timeStamp as (...args: unknown[]) => void;
    stamp("Render", 0, 1, "Components ⚛", undefined, "primary");
    stamp("Blocking", 0, 1, "Blocking", "Scheduler ⚛", "primary");
    stamp("own mark");
    performance.measure("​Backdrop", { start: 0, end: 1, detail: { devtools: {} } });
    performance.measure("own measure", { start: 0, end: 1 });

    expect(timeStamp).toHaveBeenCalledTimes(1);
    expect(timeStamp).toHaveBeenCalledWith("own mark");
    expect(measure).toHaveBeenCalledTimes(1);
    expect(measure).toHaveBeenCalledWith("own measure", { start: 0, end: 1 });
  });
});

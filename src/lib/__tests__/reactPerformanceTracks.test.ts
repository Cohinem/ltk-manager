import { afterEach, describe, expect, it } from "vitest";

import { quietReactPerformanceTracks } from "../reactPerformanceTracks";

const original = { timeStamp: console.timeStamp, measure: performance.measure };

afterEach(() => {
  console.timeStamp = original.timeStamp;
  performance.measure = original.measure;
});

describe("quietReactPerformanceTracks", () => {
  it("removes console.timeStamp and leaves performance.measure", () => {
    quietReactPerformanceTracks();

    expect(typeof console.timeStamp).toBe("undefined");
    expect(performance.measure).toBe(original.measure);
  });
});

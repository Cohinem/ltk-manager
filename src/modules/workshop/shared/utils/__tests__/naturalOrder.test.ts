import { describe, expect, it } from "vitest";

import { compareNames } from "../naturalOrder";
import fixture from "./naturalOrder.fixture.json";

describe("compareNames", () => {
  it.each(fixture.cases)("$name", ({ input, expect: want }) => {
    expect([...input].sort(compareNames)).toEqual(want);
  });

  it("is a total order: reversing the input does not change the result", () => {
    for (const { input, expect: want } of fixture.cases) {
      expect([...input].reverse().sort(compareNames)).toEqual(want);
    }
  });

  it("is antisymmetric over every pair the fixture names", () => {
    const names = [...new Set(fixture.cases.flatMap((c) => c.input))];
    for (const a of names) {
      for (const b of names) {
        /* Summed rather than negated: Math.sign gives -0, which Object.is
        holds apart from 0. */
        expect(Math.sign(compareNames(a, b)) + Math.sign(compareNames(b, a))).toBe(0);
      }
    }
  });
});

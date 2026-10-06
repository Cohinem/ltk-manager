import { describe, expect, it } from "vitest";

import { clampInto, placeBeside } from "../floatPlace";

const SHELL = { width: 1000, height: 800 };
const FRAME = { width: 400, height: 300 };

describe("clampInto", () => {
  it("leaves a place inside the shell alone", () => {
    expect(clampInto({ x: 100, y: 120 }, SHELL, FRAME)).toEqual({ x: 100, y: 120 });
  });

  it("holds a frame a margin inside each edge of the shell", () => {
    expect(clampInto({ x: -50, y: -50 }, SHELL, FRAME)).toEqual({ x: 8, y: 8 });
    expect(clampInto({ x: 5000, y: 5000 }, SHELL, FRAME)).toEqual({ x: 592, y: 492 });
  });

  it("keeps the corner of a frame larger than the shell in view", () => {
    expect(clampInto({ x: 40, y: 40 }, { width: 300, height: 200 }, FRAME)).toEqual({ x: 8, y: 8 });
  });
});

describe("placeBeside", () => {
  it("opens under a press, reaching left from one in the right half", () => {
    expect(placeBeside({ x: 900, y: 100 }, SHELL, FRAME)).toEqual({ x: 524, y: 124 });
  });

  it("opens under a press, reaching right from one in the left half", () => {
    expect(placeBeside({ x: 200, y: 100 }, SHELL, FRAME)).toEqual({ x: 176, y: 124 });
  });

  it("opens over a press with no room under it, so the pressed row stays in view", () => {
    expect(placeBeside({ x: 200, y: 700 }, SHELL, FRAME)).toEqual({ x: 176, y: 376 });
  });

  it("opens in the middle of the shell with no press to open beside", () => {
    expect(placeBeside(null, SHELL, FRAME)).toEqual({ x: 300, y: 250 });
  });
});

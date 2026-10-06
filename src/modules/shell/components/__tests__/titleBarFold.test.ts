import { describe, expect, it } from "vitest";

import { titleBarFold } from "../titleBarFold";

describe("titleBarFold", () => {
  it("draws the whole left side in a wide window", () => {
    expect(titleBarFold(1200, 16)).toBe("full");
  });

  it("drops the navigation to icons before it drops the wordmark", () => {
    expect(titleBarFold(1100, 16)).toBe("icons");
    expect(titleBarFold(960, 16)).toBe("bare");
  });

  it("folds a zoomed-in window that a zoomed-out one of the same width does not", () => {
    expect(titleBarFold(1100, 14.4)).toBe("full");
    expect(titleBarFold(1100, 20)).toBe("bare");
  });
});

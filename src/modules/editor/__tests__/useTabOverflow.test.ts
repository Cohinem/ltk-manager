import { offscreenTabs, type Span } from "../useTabOverflow";

const LANE: Span = { left: 0, right: 100 };

describe("offscreenTabs", () => {
  it("counts none while the lane holds every tab", () => {
    const tabs = [
      { left: 0, right: 40 },
      { left: 42, right: 80 },
    ];

    expect(offscreenTabs(LANE, tabs)).toBe(0);
  });

  it("counts a tab past the trailing edge", () => {
    const tabs = [
      { left: 0, right: 60 },
      { left: 62, right: 130 },
    ];

    expect(offscreenTabs(LANE, tabs)).toBe(1);
  });

  it("counts a tab scrolled off the leading edge", () => {
    const tabs = [
      { left: -60, right: -4 },
      { left: 0, right: 60 },
    ];

    expect(offscreenTabs(LANE, tabs)).toBe(1);
  });

  it("counts a tab the lane cuts in half", () => {
    expect(offscreenTabs(LANE, [{ left: 70, right: 130 }])).toBe(1);
  });

  it("holds a tab flush with an edge whole", () => {
    expect(offscreenTabs(LANE, [{ left: 0, right: 100 }])).toBe(0);
  });
});

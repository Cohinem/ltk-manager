import { describe, expect, it } from "vitest";

import { shownSubject, type WaveformSubject } from "../waveformSync";

const played: WaveformSubject = { key: "e1", urls: ["a", "b"] };
const selected: WaveformSubject = { key: "n4", urls: ["c"] };

describe("shownSubject", () => {
  it("returns what plays over the selection", () => {
    expect(shownSubject(played, "e1", selected)).toBe(played);
  });

  it("returns the selection while nothing plays", () => {
    expect(shownSubject(played, null, selected)).toBe(selected);
  });

  it("returns the selection while another key plays", () => {
    expect(shownSubject(played, "e9", selected)).toBe(selected);
  });

  it("returns what played last if no row with media is selected", () => {
    expect(shownSubject(played, null, null)).toBe(played);
  });

  it("returns null if nothing played and no row with media is selected", () => {
    expect(shownSubject(null, null, null)).toBeNull();
  });
});

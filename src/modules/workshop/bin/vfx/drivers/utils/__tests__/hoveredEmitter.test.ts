import { describe, expect, it } from "vitest";

import { emitterKeyOf, masterIdOf } from "../../state/hoveredEmitter";

describe("hoveredEmitter", () => {
  it("reads the emitter off its master node and every node under it", () => {
    expect(emitterKeyOf("e", "c3")).toEqual({ entry: "e", simple: false, listIndex: 3 });
    expect(emitterKeyOf("e", "s12/0x1234/render")).toEqual({
      entry: "e",
      simple: true,
      listIndex: 12,
    });
    expect(emitterKeyOf("e", "c31x")).toBeNull();
    expect(emitterKeyOf("e", "frame:c3")).toBeNull();
  });

  it("names the master node an emitter's choice selects", () => {
    expect(masterIdOf(false, 4)).toBe("c4");
    expect(masterIdOf(true, 0)).toBe("s0");
  });
});

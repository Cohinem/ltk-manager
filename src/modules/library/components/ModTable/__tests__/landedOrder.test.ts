import { describe, expect, it } from "vitest";

import { landedOrder } from "../useRowDrag";

const order = ["a", "b", "c", "d"];

describe("landedOrder", () => {
  it("moves a mod down to land after another", () => {
    expect(landedOrder(order, "a", { modId: "c", after: true })).toEqual(["b", "c", "a", "d"]);
  });

  it("moves a mod up to land before another", () => {
    expect(landedOrder(order, "d", { modId: "b", after: false })).toEqual(["a", "d", "b", "c"]);
  });

  it("leaves the order alone when the mod lands where it was", () => {
    expect(landedOrder(order, "b", { modId: "a", after: true })).toEqual(order);
  });
});

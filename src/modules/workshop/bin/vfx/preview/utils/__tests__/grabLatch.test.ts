import { describe, expect, it } from "vitest";

import { createGrabLatch } from "../grabLatch";

describe("createGrabLatch", () => {
  it("leaves a release no gizmo marked to the pick", () => {
    expect(createGrabLatch().take()).toBe(false);
  });

  it("hands a gizmo's press to the one release that ends it", () => {
    const latch = createGrabLatch();
    latch.grab();

    expect(latch.take()).toBe(true);
    expect(latch.take()).toBe(false);
  });
});

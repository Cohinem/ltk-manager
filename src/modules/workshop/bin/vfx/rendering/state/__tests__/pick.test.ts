import { ShaderMaterial } from "three";
import { describe, expect, it } from "vitest";

import { emitterOf } from "../../../engine/simulation/__tests__/emitterFixture";
import type { DrawnEmitter } from "../../utils/definitions";
import { createPickRegistry, type PickEntry } from "../pick";

function entryOf(index: number): PickEntry {
  const owner: DrawnEmitter = {
    key: `${index}`,
    emitter: emitterOf(index),
    path: "",
    root: index,
    rank: index,
  };
  return {
    solid: { current: null },
    twin: { current: null },
    material: new ShaderMaterial(),
    owner,
  };
}

describe("createPickRegistry", () => {
  it("lists its entries in the order they were added", () => {
    const registry = createPickRegistry();
    const first = entryOf(0);
    const second = entryOf(1);
    registry.add(first);
    registry.add(second);

    expect(registry.entries()).toEqual([first, second]);
  });

  it("lets an entry go through the call its add returned, and no other", () => {
    const registry = createPickRegistry();
    const kept = entryOf(0);
    const dropped = entryOf(1);
    registry.add(kept);
    const release = registry.add(dropped);
    release();

    expect(registry.entries()).toEqual([kept]);
  });
});

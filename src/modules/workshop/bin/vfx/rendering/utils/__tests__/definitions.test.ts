import { describe, expect, it } from "vitest";

import { nameHash } from "../../../../shared/utils/binHash";
import { DRAG_MOTION } from "../../../engine/model/enums";
import type { ChildSetModel, EmitterModel, SystemModel } from "../../../engine/model/model";
import { readVfxSystem } from "../../../engine/parsing/readVfxSystem";
import { MAX_CHILD_DEPTH } from "../../../engine/simulation/children";
import { drawnEmitters } from "../definitions";
import { GROUND_ORDER } from "../drawKind";

const SYSTEM_CLASS = nameHash("VfxSystemDefinitionData");

/** An emitter read off an empty struct, so every field is the schema's default. */
function emitterAt(index: number, over: Partial<EmitterModel> = {}): EmitterModel {
  const [read] = readVfxSystem({
    materials: [],
    entry: "0x1",
    name: null,
    classHash: SYSTEM_CLASS,
    class: null,
    root: {
      type: "struct",
      classHash: SYSTEM_CLASS,
      class: null,
      object: null,
      fields: [
        {
          hash: nameHash("complexEmitterDefinitionData"),
          name: "complexEmitterDefinitionData",
          value: {
            type: "container",
            items: [
              {
                type: "struct",
                classHash: nameHash("VfxEmitterDefinitionData"),
                class: null,
                object: null,
                fields: [],
              },
            ],
          },
        },
      ],
    },
  }).emitters;
  return { ...read, index, listIndex: index, ...over };
}

function system(...emitters: EmitterModel[]): SystemModel {
  return {
    entry: null,
    name: null,
    emitters,
    transform: null,
    dragMotion: DRAG_MOTION.stepped,
    buildUpTime: 0,
  };
}

function setOf(children: (SystemModel | null)[], over: Partial<ChildSetModel> = {}): ChildSetModel {
  return {
    children,
    bones: [],
    probability: { constant: [0], keys: [], tables: [] },
    onDeath: false,
    inheritance: null,
    ...over,
  };
}

describe("drawnEmitters", () => {
  it("lists the opened system's emitters under no path, ranked among themselves", () => {
    const drawn = drawnEmitters(system(emitterAt(0), emitterAt(1)));

    expect(drawn.map(({ key, path, root, rank }) => ({ key, path, root, rank }))).toEqual([
      { key: "0", path: "", root: 0, rank: 0 },
      { key: "1", path: "", root: 1, rank: 1 },
    ]);
  });

  it("draws a ground-layer emitter under everything else, first among its own", () => {
    const drawn = drawnEmitters(
      system(
        emitterAt(0),
        emitterAt(1, { groundLayer: true }),
        emitterAt(2, { groundLayer: true }),
      ),
    );

    expect(drawn.map(({ key, rank }) => ({ key, rank }))).toEqual([
      { key: "0", rank: 2 },
      { key: "1", rank: GROUND_ORDER },
      { key: "2", rank: GROUND_ORDER + 1 },
    ]);
  });

  it("lists a child's emitters under its path, after the opened system's, owned by their root", () => {
    const spark = system(emitterAt(0), emitterAt(1));
    const drawn = drawnEmitters(
      system(emitterAt(0), emitterAt(1, { childSet: setOf([null, spark]) })),
    );

    expect(drawn.slice(2).map(({ key, path, root, rank }) => ({ key, path, root, rank }))).toEqual([
      { key: "1.1:0", path: "1.1", root: 1, rank: 2 },
      { key: "1.1:1", path: "1.1", root: 1, rank: 3 },
    ]);
  });

  it("nests a grandchild's path under its parent's", () => {
    const grandchild = system(emitterAt(0));
    const child = system(emitterAt(0, { childSet: setOf([grandchild]) }));
    const drawn = drawnEmitters(system(emitterAt(0, { childSet: setOf([child]) })));

    expect(drawn.map(({ path }) => path)).toEqual(["", "0.0", "0.0/0.0"]);
  });

  it("leaves out a set naming bones and a child past the depth cap", () => {
    let nested = system(emitterAt(0));
    for (let depth = 0; depth <= MAX_CHILD_DEPTH; depth += 1) {
      nested = system(emitterAt(0, { childSet: setOf([nested]) }));
    }
    const boned = system(
      emitterAt(0, { childSet: setOf([system(emitterAt(0))], { bones: ["R_Hand"] }) }),
    );

    expect(drawnEmitters(nested)).toHaveLength(MAX_CHILD_DEPTH + 1);
    expect(drawnEmitters(boned)).toHaveLength(1);
  });

  it("lists a bone set's children only where a character is posed to spawn them on", () => {
    const boned = system(
      emitterAt(0, { childSet: setOf([system(emitterAt(0))], { bones: ["R_Hand"] }) }),
    );

    expect(drawnEmitters(boned)).toHaveLength(1);
    expect(drawnEmitters(boned, true)).toHaveLength(2);
  });
});

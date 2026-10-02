import { describe, expect, it } from "vitest";

import type { ChildSetModel, EmitterModel, SystemModel } from "../../../engine/model/model";
import { emptySystem } from "../../../engine/model/systemModel";
import { emitterOf } from "../../../engine/simulation/__tests__/emitterFixture";
import { type DrawnEmitter, drawnEmitters } from "../../../rendering/utils/definitions";
import { drawnLane } from "../selection";

function system(...emitters: EmitterModel[]): SystemModel {
  return { ...emptySystem("0x1"), emitters };
}

function setOf(children: (SystemModel | null)[]): ChildSetModel {
  return {
    children,
    bones: [],
    probability: { constant: [1], keys: [], tables: [] },
    onDeath: false,
    inheritance: null,
  };
}

function drawnAt(opened: SystemModel, path: string, index: number): DrawnEmitter {
  const found = drawnEmitters(opened).find(
    (each) => each.path === path && each.emitter.index === index,
  );
  if (found === undefined) throw new Error(`nothing drawn at ${path}:${index}`);
  return found;
}

describe("drawnLane", () => {
  it("selects an emitter of the opened system on its lane", () => {
    const opened = system(emitterOf(0), emitterOf(1));

    expect(drawnLane(opened, drawnAt(opened, "", 1))).toEqual({
      kind: "emitter",
      emitter: opened.emitters[1],
    });
  });

  it("selects a child's emitter on its child lane under its parent", () => {
    const child = system(emitterOf(0), emitterOf(1));
    const opened = system(emitterOf(0), emitterOf(1, { childSet: setOf([null, child]) }));
    const pick = drawnLane(opened, drawnAt(opened, "1.1", 1));

    expect(pick?.kind).toBe("child");
    if (pick?.kind !== "child") return;
    expect(pick.parent).toBe(opened.emitters[1]);
    expect(pick.lane.path).toBe("1.1");
    expect(pick.lane.emitter).toBe(child.emitters[1]);
  });

  it("selects a grandchild on the child lane it descends from", () => {
    const grandchild = system(emitterOf(0));
    const child = system(emitterOf(0), emitterOf(1, { childSet: setOf([grandchild]) }));
    const opened = system(emitterOf(0, { childSet: setOf([child]) }));
    const pick = drawnLane(opened, drawnAt(opened, "0.0/1.0", 0));

    expect(pick?.kind).toBe("child");
    if (pick?.kind !== "child") return;
    expect(pick.lane.path).toBe("0.0");
    expect(pick.lane.emitter).toBe(child.emitters[1]);
  });

  it("selects nothing for an emitter the system does not contain", () => {
    const opened = system(emitterOf(0), emitterOf(1));
    const stale = drawnAt(opened, "", 1);

    expect(drawnLane(system(emitterOf(0)), stale)).toBeNull();
  });
});

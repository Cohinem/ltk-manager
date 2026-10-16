import { describe, expect, it } from "vitest";

import type { ChildSetModel, EmitterModel, SystemModel } from "../../../engine/model/model";
import { emptySystem } from "../../../engine/model/systemModel";
import { emitterOf } from "../../../engine/simulation/__tests__/emitterFixture";
import { type DrawnEmitter, drawnEmitters } from "../../../rendering/utils/definitions";
import { chosenEmitters, drawnLane, pickLanes, togglesAll } from "../selection";

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

describe("pickLanes", () => {
  const listed = ["a", "b", "c", "d"];

  it("selects the clicked lane alone on a plain click", () => {
    expect(pickLanes(listed, new Set(["a", "b"]), "a", "c", "only")).toEqual({
      keys: new Set(["c"]),
      open: "c",
      anchor: "c",
    });
  });

  it("adds a lane on a toggle and opens it", () => {
    expect(pickLanes(listed, new Set(["a"]), "a", "c", "toggle")).toEqual({
      keys: new Set(["a", "c"]),
      open: "c",
      anchor: "c",
    });
  });

  it("removes a lane on a toggle and opens the first lane left if the open one is removed", () => {
    expect(pickLanes(listed, new Set(["b", "c"]), "c", "c", "toggle")).toEqual({
      keys: new Set(["b"]),
      open: "b",
      anchor: "c",
    });
  });

  it("keeps the clicked lane if a toggle would empty the selection", () => {
    expect(pickLanes(listed, new Set(["b"]), "b", "b", "toggle").keys).toEqual(new Set(["b"]));
  });

  it("selects the lanes from the anchor to the clicked lane in either direction on a range", () => {
    expect(pickLanes(listed, new Set(["b"]), "b", "d", "range")).toEqual({
      keys: new Set(["b", "c", "d"]),
      open: "d",
      anchor: "b",
    });
    expect(pickLanes(listed, new Set(["c"]), "c", "a", "range").keys).toEqual(
      new Set(["a", "b", "c"]),
    );
  });

  it("selects the clicked lane alone on a range if the anchor is missing or not listed", () => {
    expect(pickLanes(listed, new Set(), null, "b", "range").keys).toEqual(new Set(["b"]));
    expect(pickLanes(listed, new Set(["x"]), "x", "b", "range").keys).toEqual(new Set(["b"]));
  });
});

describe("togglesAll", () => {
  it("adds every member unless all of them are held, and then removes them all", () => {
    expect(togglesAll(new Set([1, 5]), [1, 2])).toEqual(new Set([1, 2, 5]));
    expect(togglesAll(new Set([1, 2, 5]), [1, 2])).toEqual(new Set([5]));
  });
});

describe("chosenEmitters", () => {
  it("returns the pool index of each place that the system contains, in the order given", () => {
    const opened = system(emitterOf(0), emitterOf(1, { simple: true, listIndex: 0 }));

    expect(
      chosenEmitters(opened, [
        { index: 0, simple: true },
        { index: 0, simple: false },
        { index: 7, simple: false },
      ]),
    ).toEqual([1, 0]);
  });
});

import { describe, expect, it } from "vitest";

import type { ObjectProperties } from "@/lib/tauri";

import {
  deleteEdit,
  duplicateEdit,
  type NodeTarget,
  outermost,
  propertyEdit,
  takesProperty,
  wrapEdit,
} from "../nodeBatch";

function sound(
  object: number,
  parent: number,
  ancestors: number[] = [parent],
  parentKind: NodeTarget["parentKind"] = "container",
): NodeTarget {
  return { object, parent, parentKind, kind: "sound", ancestors };
}

const container: NodeTarget = {
  object: 10,
  parent: 1,
  parentKind: "container",
  kind: "container",
  ancestors: [1],
};
const event: NodeTarget = {
  object: 100,
  parent: null,
  parentKind: null,
  kind: "event",
  ancestors: [],
};

function volumes(values: Record<number, number>): Map<number, ObjectProperties> {
  return new Map(
    Object.entries(values).map(([id, value]) => [
      Number(id),
      {
        id: Number(id),
        editable: true,
        values: [{ property: "volume", value }],
        weights: null,
      },
    ]),
  );
}

describe("outermost", () => {
  it("drops a target that a picked container holds, and repeats", () => {
    const child = sound(11, 10, [1, 10]);

    expect(outermost([container, child, child]).map((t) => t.object)).toEqual([10]);
  });
});

describe("deleteEdit", () => {
  it("returns one delete for one target", () => {
    expect(deleteEdit([sound(5, 10)])).toEqual({ kind: "delete", object: 5, parent: 10 });
  });

  it("returns one batch for several targets, so they undo as one step", () => {
    expect(deleteEdit([sound(5, 10), event])).toEqual({
      kind: "batch",
      edits: [
        { kind: "delete", object: 5, parent: 10 },
        { kind: "delete", object: 100, parent: null },
      ],
    });
  });

  it("returns null for no target", () => {
    expect(deleteEdit([])).toBeNull();
  });
});

describe("duplicateEdit", () => {
  it("leaves out events, which take a name", () => {
    expect(duplicateEdit([event, sound(5, 10)])).toEqual({
      kind: "duplicate",
      object: 5,
      parent: 10,
    });
  });
});

describe("wrapEdit", () => {
  it("wraps the targets of one container together and a Play target alone", () => {
    const played = sound(7, 20, [20], "action");

    expect(wrapEdit([sound(5, 10), sound(6, 10), played], "random")).toEqual({
      kind: "batch",
      edits: [
        { kind: "wrap", objects: [7], parent: 20, container: "random" },
        { kind: "wrap", objects: [5, 6], parent: 10, container: "random" },
      ],
    });
  });

  it("returns null for events and actions", () => {
    const action: NodeTarget = {
      object: 50,
      parent: 100,
      parentKind: "event",
      kind: "action",
      ancestors: [100],
    };

    expect(wrapEdit([event, action], "random")).toBeNull();
  });
});

describe("takesProperty", () => {
  it("returns false if one target does not take the property", () => {
    expect(takesProperty([sound(5, 10)], "loopCount")).toBe(true);
    expect(takesProperty([sound(5, 10), container], "loopCount")).toBe(false);
  });
});

describe("propertyEdit", () => {
  it("moves the volume of every target by the change of the edited one", () => {
    const edit = propertyEdit(
      [sound(5, 10), sound(6, 10)],
      "volume",
      5,
      -3,
      -1,
      volumes({ 5: -3, 6: -10 }),
    );

    expect(edit).toEqual({
      kind: "batch",
      edits: [
        { kind: "property", object: 5, property: "volume", value: -1 },
        { kind: "property", object: 6, property: "volume", value: -8 },
      ],
    });
  });

  it("sets the same value of a property that is not relative", () => {
    const edit = propertyEdit([sound(5, 10), sound(6, 10)], "lpf", 5, 0, 40, new Map());

    expect(edit).toEqual({
      kind: "batch",
      edits: [
        { kind: "property", object: 5, property: "lpf", value: 40 },
        { kind: "property", object: 6, property: "lpf", value: 40 },
      ],
    });
  });

  it("leaves out a target that does not take the property", () => {
    const edit = propertyEdit([sound(5, 10), container], "loopCount", 5, 1, 3, new Map());

    expect(edit).toEqual({ kind: "property", object: 5, property: "loopCount", value: 3 });
  });
});

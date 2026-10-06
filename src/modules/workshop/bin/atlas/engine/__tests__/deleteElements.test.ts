import { describe, expect, it } from "vitest";

import { nameHash } from "../../../shared/utils/binHash";
import { deletionOf } from "../edit/deleteElements";
import { buildTree, copyKey } from "../model/tree";
import type { ViewLook } from "../model/view";
import { element, icon, scene, view } from "./fixtures";

function group(children: string[]): ViewLook {
  return {
    kind: "group",
    children,
    states: [],
    alpha: 1,
    layout: null,
    button: null,
    meter: null,
  } as ViewLook;
}

const TREE = buildTree(
  view(
    [scene("hud", 0)],
    [
      element("bar", "hud", 0, group(["slot", "row", "cap"]), null),
      element("slot", "hud", 0, icon()),
      element("row", "hud", 0, group(["cell"]), null),
      element("cell", "hud", 0, icon()),
      element("cap", "hud", 0, icon()),
      element("lone", "hud", 0, icon()),
    ],
  ),
);

describe("deletionOf", () => {
  it("removes an element no group lists and edits nothing else", () => {
    expect(deletionOf(TREE, ["lone"])).toEqual({ removed: ["lone"], unlisted: [] });
  });

  it("takes the removed children out of the group that stays, the last first", () => {
    const { removed, unlisted } = deletionOf(TREE, ["slot", "cap"]);

    expect(removed).toEqual(["slot", "cap"]);
    expect(unlisted).toEqual([
      {
        entry: "bar",
        holder: "",
        field: nameHash("Elements"),
        edits: [
          { type: "removeItem", path: "[2]" },
          { type: "removeItem", path: "[0]" },
        ],
      },
    ]);
  });

  it("removes a group with everything under it, and unlists it from the group above", () => {
    const { removed, unlisted } = deletionOf(TREE, ["row"]);

    expect(removed).toEqual(["row", "cell"]);
    expect(unlisted.map((edit) => [edit.entry, edit.edits])).toEqual([
      ["bar", [{ type: "removeItem", path: "[1]" }]],
    ]);
  });

  it("edits no list of a group that goes too", () => {
    const { removed, unlisted } = deletionOf(TREE, ["bar", "cell"]);

    expect([...removed].sort()).toEqual(["bar", "cap", "cell", "row", "slot"]);
    expect(unlisted).toEqual([]);
  });

  it("leaves out a key the file holds no object for, such as a controller's copy", () => {
    expect(deletionOf(TREE, [copyKey("slot", "clone")])).toEqual({ removed: [], unlisted: [] });
  });
});

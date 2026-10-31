import { describe, expect, it } from "vitest";

import type { NodeProperty } from "@/lib/tauri";

import { fieldGroups, fieldTopic } from "../fieldTopics";
import type { FieldOwner, NodeField } from "../nodeFields";

function property(name: NodeProperty, owner: FieldOwner["kind"] = "node"): NodeField {
  return {
    name,
    owner,
    value: 0,
    editable: true,
    target: { kind: "property", object: 1, property: name },
    detail: { kind: "none" },
  };
}

describe("fieldTopic", () => {
  it("tells a Play action's delay from a node's", () => {
    expect(fieldTopic(property("delay", "action"))).toBe("actionDelay");
    expect(fieldTopic(property("delay"))).toBe("initialDelay");
  });
});

describe("fieldGroups", () => {
  it("groups fields and facts by section in inspector order and skips an empty section", () => {
    const groups = fieldGroups(
      [property("loopCount"), property("pitch"), property("hpf"), property("volume")],
      [{ kind: "pick", weighted: true }],
    );

    expect(
      groups.map(({ section, entries }) => [section, entries.map((each) => each.topic)]),
    ).toEqual([
      ["mix", ["volume", "pitch"]],
      ["filters", ["hpf"]],
      ["timing", ["loopCount"]],
      ["selection", ["pick"]],
    ]);
  });
});

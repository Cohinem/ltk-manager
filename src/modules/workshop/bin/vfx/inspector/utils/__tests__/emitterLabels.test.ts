import { describe, expect, it } from "vitest";

import { nameHash } from "../../../../shared/utils/binHash";
import { GROUP_FIELDS, type InspectorGroup } from "../emitterGroups";
import { emitterLabel, filterEmitterGroups, matchesEmitterField } from "../emitterLabels";

describe("emitter creator labels", () => {
  it("covers every grouped property without requiring a raw name", () => {
    for (const name of Object.values(GROUP_FIELDS).flat()) {
      expect(emitterLabel(nameHash(name)), name).toBeTruthy();
    }

    expect(emitterLabel(nameHash("bindWeight"))).toBe("Attachment Weight");
    expect(emitterLabel(nameHash("scale0"))).toBe("Scale over Lifetime");
    expect(emitterLabel(nameHash("pass"))).toBe("Render Order");
  });

  it("formats nested schema names without inventing names for unresolved hashes", () => {
    expect(emitterLabel(nameHash("mCustomUVScale"), "mCustomUVScale")).toBe("Custom UV Scale");
    expect(emitterLabel(nameHash("someField"), "someField")).toBe("Some Field");
    expect(emitterLabel("0xd1ee8634", "0xd1ee8634")).toBeUndefined();
    expect(emitterLabel("", "[0]")).toBeUndefined();
    expect(
      matchesEmitterField(
        "custom uv scale",
        nameHash("mCustomUVScale"),
        "mCustomUVScale",
        "Texture",
      ),
    ).toBe(true);
  });

  it("resolves labels by identity and leaves unknown properties unnamed", () => {
    expect(emitterLabel(nameHash("birthVelocity"))).toBe("Initial Velocity");
    expect(emitterLabel(nameHash("birthVelocity").toUpperCase())).toBe("Initial Velocity");
    expect(emitterLabel("0x00000000")).toBeUndefined();
  });

  it("matches all terms across the alias, raw name, hash and group", () => {
    const hash = nameHash("birthVelocity");

    for (const query of ["initial velocity", "BIRTHVELOCITY", hash, " birth initial  "]) {
      expect(matchesEmitterField(query, hash, "birthVelocity", "Birth")).toBe(true);
    }

    expect(matchesEmitterField("initial rotation", hash, "birthVelocity", "Birth")).toBe(false);
  });

  it("filters unauthored fields without replacing their schema or removing section identities", () => {
    const field = { hash: nameHash("birthVelocity"), name: "birthVelocity", declared: null };
    const groups: InspectorGroup[] = [
      { group: "birth", rows: [], defaults: [field] },
      { group: "texture", rows: [], defaults: [] },
    ];
    const filtered = filterEmitterGroups(groups, "initial velocity");

    expect(filtered).toHaveLength(2);
    expect(filtered[0]!.defaults[0]).toBe(field);
    expect(filterEmitterGroups(groups, "missing")[0]!.defaults).toEqual([]);
    expect(groups[0]!.defaults).toEqual([field]);
    expect(filterEmitterGroups(groups, "  ")).toBe(groups);
  });
});

import { describe, expect, it } from "vitest";

import { fieldAlias, pathAlias } from "../nodeText";

describe("fieldAlias", () => {
  it("labels a field the inspector aliases by its alias", () => {
    expect(fieldAlias("rate")).toBe("Emission Rate");
  });

  it("spaces any other field's name into words", () => {
    expect(fieldAlias("emitOffset")).toBe("Emit Offset");
  });

  it("keeps a list item's index as it is", () => {
    expect(fieldAlias("[0]")).toBe("[0]");
  });
});

describe("pathAlias", () => {
  it("aliases every field of a port's path", () => {
    expect(pathAlias("SpawnBehavior.EmissionRate")).toBe("Spawn Behavior.Emission Rate");
  });
});

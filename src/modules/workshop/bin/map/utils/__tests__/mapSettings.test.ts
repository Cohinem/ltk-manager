import { describe, expect, it } from "vitest";

import type { BinRow } from "@/lib/tauri";

import { hashOf } from "../../../shared/utils/binHash";
import { componentRow, missingFields, partRows } from "../mapSettings";

function field(name: string, holder = ""): BinRow {
  const step = hashOf(name).slice(2);
  return {
    entry: "0x1",
    path: holder === "" ? step : `${holder}.${step}`,
    label: name,
    node: "property",
    name,
    unnamed: name.startsWith("0x"),
    kind: null,
    value: { type: "none" },
    declared: null,
  };
}

function component(className: string, index: number): BinRow {
  return {
    ...field("components"),
    path: `components[${index}]`,
    name: `[${index}]`,
    value: { type: "struct", classHash: hashOf(className), class: className, len: 0 },
  };
}

describe("partRows", () => {
  it("returns the listed fields in the order of the list", () => {
    const rows = [field("GammaParameters"), field("mapPath"), field("mColorizationPostEffect")];

    const shown = partRows(rows, {
      owner: "skin",
      fields: ["mColorizationPostEffect", "GammaParameters"],
    });

    expect(shown.map((row) => row.name)).toEqual(["mColorizationPostEffect", "GammaParameters"]);
  });

  it("splits fields by name prefix with only and exclude", () => {
    const rows = [
      field("sunColor", "a[0]"),
      field("fogColor", "a[0]"),
      field("fogEnabled", "a[0]"),
    ];

    expect(partRows(rows, { owner: "container", only: ["fog"] }).map((row) => row.name)).toEqual([
      "fogColor",
      "fogEnabled",
    ]);
    expect(partRows(rows, { owner: "container", exclude: ["fog"] }).map((row) => row.name)).toEqual(
      ["sunColor"],
    );
  });

  it("matches a field listed as a hash", () => {
    const rows = [field("0xd0a4e40b")];

    expect(partRows(rows, { owner: "skin", fields: ["0xd0a4e40b"] })).toHaveLength(1);
  });
});

describe("missingFields", () => {
  it("returns the listed fields that the rows do not contain", () => {
    const rows = [field("GammaParameters")];

    expect(
      missingFields(rows, {
        owner: "skin",
        fields: ["mColorizationPostEffect", "GammaParameters"],
      }),
    ).toEqual(["mColorizationPostEffect"]);
  });
});

describe("componentRow", () => {
  it("returns the first component of a class and null if the list has none", () => {
    const components = [
      component("MapSunProperties", 0),
      component("MapClouds", 1),
      component("MapClouds", 2),
    ];

    expect(componentRow(components, "MapClouds")?.path).toBe("components[1]");
    expect(componentRow(components, "MapSSAO")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import type { BankNode } from "@/lib/tauri";

import {
  formatValue,
  matchingNodes,
  parseId,
  parseValue,
  parseWeight,
  weightText,
} from "../bankEdits";
import { NO_NAMES } from "../nodeNames";

describe("parseValue", () => {
  it("reads a decimal number", () => {
    expect(parseValue("-6.5", "volume")).toBe(-6.5);
  });

  it("returns the property default if the text is empty", () => {
    expect(parseValue("  ", "loopCount")).toBe(1);
    expect(parseValue("", "pitch")).toBe(0);
  });

  it("returns null if the text is not a number", () => {
    expect(parseValue("loud", "volume")).toBeNull();
  });
});

describe("formatValue", () => {
  it("rounds to three decimals and drops trailing zeros", () => {
    expect(formatValue(0.25)).toBe("0.25");
    expect(formatValue(-6.000_001)).toBe("-6");
    expect(formatValue(1 / 3)).toBe("0.333");
  });
});

describe("weightText", () => {
  it("shows a stored weight in Wwise units", () => {
    expect(weightText(50_000)).toBe("50");
    expect(parseWeight("12.5")).toBe(12_500);
  });

  it("refuses a negative weight", () => {
    expect(parseWeight("-1")).toBeNull();
  });
});

describe("parseId", () => {
  it("reads a decimal ID with or without a leading #", () => {
    expect(parseId("#414059032")).toBe(414_059_032);
    expect(parseId("12")).toBe(12);
  });

  it("returns null for a value outside u32", () => {
    expect(parseId("4294967296")).toBeNull();
    expect(parseId("1.5")).toBeNull();
  });
});

describe("matchingNodes", () => {
  const nodes: BankNode[] = [
    { id: 100, objectKind: 2, kindName: "Sound", bank: "a.bnk" },
    { id: 205, objectKind: 5, kindName: "RandomSequenceContainer", bank: "a.bnk" },
    { id: 300, objectKind: 2, kindName: "Sound", bank: "a.bnk" },
  ];

  it("keeps the nodes whose ID or kind contains the query, without the excluded IDs", () => {
    expect(matchingNodes(nodes, "0", new Set([300])).map((node) => node.id)).toEqual([100, 205]);
    expect(matchingNodes(nodes, "random", new Set()).map((node) => node.id)).toEqual([205]);
  });

  it("keeps the nodes whose derived name contains the query", () => {
    const names = { ...NO_NAMES, nodes: new Map([[300, "Death3D_cast #2"]]) };

    expect(matchingNodes(nodes, "death3d", new Set(), names).map((node) => node.id)).toEqual([300]);
  });
});

import { describe, expect, it } from "vitest";

import { EXPLORER_TILE_SIZES, EXPLORER_TREE_ROW_HEIGHTS } from "@/stores";

import {
  artSlotWidth,
  MAX_ART_ASPECT,
  nearestTreeRowHeight,
  originalArtWidth,
  treeArtRequestWidth,
} from "../treeArt";

describe("artSlotWidth", () => {
  it("reserves the box for a square plate", () => {
    expect(artSlotWidth(44, "square")).toBe(44);
  });

  it("reserves the widest plate an original ratio draws", () => {
    expect(artSlotWidth(44, "original")).toBe(44 * MAX_ART_ASPECT);
  });
});

describe("originalArtWidth", () => {
  it("draws a square image as a square", () => {
    expect(originalArtWidth(44, 1)).toBe(44);
  });

  it("widens with a wide image up to the slot", () => {
    expect(originalArtWidth(44, 1.5)).toBe(66);
    expect(originalArtWidth(44, 8)).toBe(88);
  });

  it("narrows with a tall image down to half the box", () => {
    expect(originalArtWidth(44, 0.75)).toBe(33);
    expect(originalArtWidth(44, 0.1)).toBe(22);
  });
});

describe("treeArtRequestWidth", () => {
  it("asks for a width the slot fits in at every declared height", () => {
    for (const height of EXPLORER_TREE_ROW_HEIGHTS) {
      for (const shape of ["square", "original"] as const) {
        const width = treeArtRequestWidth(height, shape);
        expect(EXPLORER_TILE_SIZES).toContain(width);
        expect(width).toBeGreaterThanOrEqual(artSlotWidth(height - 4, shape));
      }
    }
  });

  it("asks an original ratio for a wider image than a square", () => {
    expect(treeArtRequestWidth(48, "square")).toBe(64);
    expect(treeArtRequestWidth(48, "original")).toBe(96);
  });
});

describe("nearestTreeRowHeight", () => {
  it("snaps a thumb between two stops to the nearer", () => {
    expect(nearestTreeRowHeight(22)).toBe(20);
    expect(nearestTreeRowHeight(24)).toBe(26);
    expect(nearestTreeRowHeight(40)).toBe(32);
    expect(nearestTreeRowHeight(41)).toBe(48);
    expect(nearestTreeRowHeight(57)).toBe(64);
  });

  it("holds a value past either end at the end it passed", () => {
    expect(nearestTreeRowHeight(0)).toBe(20);
    expect(nearestTreeRowHeight(500)).toBe(64);
  });
});

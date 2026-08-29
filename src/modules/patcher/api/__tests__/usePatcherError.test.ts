// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import type { AppError, OverlayErrorCategory } from "@/lib/tauri";
import { getOverlayErrorCategory } from "@/utils/errors";

import { buildFailureTitle, classifyPatcherError } from "../usePatcherError";

function overlayError(category: OverlayErrorCategory, message = "build failed"): AppError {
  return { code: "OVERLAY", message, context: { category } };
}

describe("getOverlayErrorCategory", () => {
  it("reads the category off an OVERLAY error", () => {
    expect(getOverlayErrorCategory(overlayError("GAME_DIR"))).toBe("GAME_DIR");
  });

  it("rejects other codes even when a category-shaped context rides along", () => {
    const error: AppError = { code: "UNKNOWN", message: "x", context: { category: "GAME_DIR" } };
    expect(getOverlayErrorCategory(error)).toBeUndefined();
  });

  it("rejects a category it has never heard of", () => {
    const error: AppError = {
      code: "OVERLAY",
      message: "x",
      context: { category: "SOMETHING_NEW" },
    };
    expect(getOverlayErrorCategory(error)).toBeUndefined();
  });
});

describe("buildFailureTitle", () => {
  // The categories exist so a wrong game dir does not read as a broken mod -
  // each must surface under its own title.
  it.each([
    ["GAME_DIR", "Game Install Problem"],
    ["MOD_CONTENT", "Mod Content Problem"],
    ["WAD_LIMIT", "Mod Too Large"],
    ["CORRUPT", "Corrupt Game Files"],
    ["BUG", "Overlay Builder Bug"],
    ["OTHER", "Overlay Build Failure"],
  ] as [OverlayErrorCategory, string][])("titles a %s failure", (category, title) => {
    expect(buildFailureTitle(overlayError(category))).toBe(title);
  });

  it("keeps the generic title for a non-overlay error", () => {
    expect(buildFailureTitle({ code: "UNKNOWN", message: "x" })).toBe("Patcher Error");
  });
});

describe("classifyPatcherError", () => {
  it("treats an overlay failure as a failed build", () => {
    expect(classifyPatcherError(overlayError("CORRUPT", "chunk mismatch"))).toEqual({
      stage: "BUILD",
      message: "chunk mismatch",
    });
  });

  it("treats a patcher refusal as no failed start", () => {
    expect(classifyPatcherError({ code: "PATCHER", message: "busy" })).toBeNull();
  });
});

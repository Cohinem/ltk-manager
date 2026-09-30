import { describe, expect, it } from "vitest";

import { nameHash } from "../../../shared/utils/binHash";
import { faceFileEdits, fontColorEdit, fontFaceEdit, fontLinkEdit } from "../edit/fontEdits";

describe("font edits", () => {
  it("links a text to a font and a font to a face", () => {
    expect(fontLinkEdit("0x00000001", "0x00000002")).toEqual({
      entry: "0x00000001",
      holder: "",
      field: nameHash("FontDescription"),
      edits: [{ type: "setLeaf", path: "", value: { type: "objectLink", text: "0x00000002" } }],
    });
    expect(fontFaceEdit("0x00000002", "0x00000003").field).toBe(nameHash("typeData"));
  });

  it("writes a colour as bytes under its field", () => {
    const edit = fontColorEdit("0x00000002", "outlineColor", [1, 2, 3, 255]);

    expect(edit.field).toBe(nameHash("outlineColor"));
    expect(edit.edits).toEqual([
      { type: "setLeaf", path: "", value: { type: "color", r: 1, g: 2, b: 3, a: 255 } },
    ]);
  });

  it("points every locale of a face at one file, bold included", () => {
    const edits = faceFileEdits("0x00000003", 2, "ASSETS/UX/Fonts/Mods/Mine.ttf");

    expect(edits).toHaveLength(2);
    expect(edits[1]?.field).toBe(nameHash("localeTypes"));
    expect(edits[1]?.edits.map((edit) => edit.path)).toEqual([
      `[1].${nameHash("mFontFilePath").slice(2)}`,
      "[1]",
      `[1].${nameHash("FontFilePathBold").slice(2)}`,
    ]);
  });
});

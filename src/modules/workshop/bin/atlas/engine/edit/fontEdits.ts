import type { PropertyEdit } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";

const FONT_DESCRIPTION = nameHash("FontDescription");
const TYPE_DATA = nameHash("typeData");
const LOCALE_TYPES = nameHash("localeTypes");
const FONT_FILE = nameHash("mFontFilePath");
const FONT_FILE_BOLD = nameHash("FontFilePathBold");

/** A `GameFontDescription` colour the inspector sets, by its field name. */
export type FontColor = "color" | "outlineColor" | "shadowColor" | "glowColor";

/** The edit that draws the text `key` with the `GameFontDescription` `font`. */
export function fontLinkEdit(key: string, font: string): PropertyEdit {
  return linkEdit(key, FONT_DESCRIPTION, font);
}

/** The edit that draws the font `font` with the `FontType` `face`. */
export function fontFaceEdit(font: string, face: string): PropertyEdit {
  return linkEdit(font, TYPE_DATA, face);
}

/** The edit that sets the colour `field` of the font `font` to `rgba`, each a byte. */
export function fontColorEdit(
  font: string,
  field: FontColor,
  [r, g, b, a]: readonly [number, number, number, number],
): PropertyEdit {
  return {
    entry: font,
    holder: "",
    field: nameHash(field),
    edits: [{ type: "setLeaf", path: "", value: { type: "color", r, g, b, a } }],
  };
}

/**
 * The edits that draw each of the `locales` locales of the face `face` with the file `file`, bold
 * included, one per locale so each stays within one property's staged edits.
 */
export function faceFileEdits(face: string, locales: number, file: string): PropertyEdit[] {
  const value = { type: "string", value: file } as const;
  return Array.from({ length: locales }, (_, at) => ({
    entry: face,
    holder: "",
    field: LOCALE_TYPES,
    edits: [
      { type: "setLeaf", path: `[${at}].${FONT_FILE.slice(2)}`, value },
      { type: "ensureProperty", path: `[${at}]`, field: FONT_FILE_BOLD },
      { type: "setLeaf", path: `[${at}].${FONT_FILE_BOLD.slice(2)}`, value },
    ],
  }));
}

function linkEdit(entry: string, field: string, target: string): PropertyEdit {
  return {
    entry,
    holder: "",
    field,
    edits: [{ type: "setLeaf", path: "", value: { type: "objectLink", text: target } }],
  };
}

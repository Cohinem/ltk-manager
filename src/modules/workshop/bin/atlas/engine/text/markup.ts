import type { Rgba } from "../geometry/quads";
import type { ViewStyleSheet, ViewTextIcon } from "../model/view";

/** How a run of text draws, per the tags around it. */
export interface TextStyle {
  /** The vertex colour, `r, g, b, a` in bytes. */
  readonly color: Rgba;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly strike: boolean;
}

/** One thing a text lays out: a character, an inline icon, a line break or a list indent. */
export type TextItem =
  | { readonly kind: "char"; readonly char: string; readonly style: TextStyle }
  | { readonly kind: "icon"; readonly icon: ViewTextIcon; readonly style: TextStyle }
  | { readonly kind: "break" }
  /** The pen moving to three bullet advances in, after a list item's bullet. */
  | { readonly kind: "indent"; readonly style: TextStyle };

/** The style a text starts in: white, and no tag set. */
export const BASE_STYLE: TextStyle = {
  color: [255, 255, 255, 255],
  bold: false,
  italic: false,
  underline: false,
  strike: false,
};

const ENTITIES: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&gt;": ">",
  "&lt;": "<",
  "&nbsp;": " ",
  "&quot;": '"',
  "&zwj;": "﻿",
  "&#37;": "%",
};

const ICON = /^%i:([A-Za-z0-9]+)%/;
const FONT_COLOR = /color\s*=\s*['"]?#([0-9a-f]{6})/i;

export const BULLET = "•";

/**
 * The items a string draws, per section 2.5 of docs/plans/atlas-renderer.md and the client's
 * parser: the entities it decodes, `%i:name%` icons from `sheet`, and a stack of styles that
 * each opening tag pushes and each closing tag pops.
 *
 * `<br>` and `<hr>` break the line, `<b>`, `<i>`, `<u>`, `<s>` and `<a>` set a flag, `<font
 * color=#RRGGBB>` sets the colour, and any other tag is a style of `sheet`, or the current
 * style again where the sheet has none. A `<` with no `>` after it ends the text, and a
 * trailing line break is dropped.
 */
export function parseMarkup(source: string, sheet: ViewStyleSheet | null): TextItem[] {
  const items: TextItem[] = [];
  const stack: TextStyle[] = [BASE_STYLE];
  const current = () => stack[stack.length - 1] ?? BASE_STYLE;

  let at = 0;
  while (at < source.length) {
    const char = source[at] ?? "";

    if (char === "<") {
      const close = source.indexOf(">", at);
      if (close < 0) break;

      applyTag(source.slice(at + 1, close), stack, items, sheet);
      at = close + 1;
      continue;
    }

    if (char === "&") {
      const entity = Object.keys(ENTITIES).find((name) => source.startsWith(name, at));
      if (entity !== undefined) {
        items.push({ kind: "char", char: ENTITIES[entity] ?? "", style: current() });
        at += entity.length;
        continue;
      }
    }

    if (char === "%") {
      const icon = ICON.exec(source.slice(at));
      if (icon !== null) {
        const found = sheet?.icons.find((each) => each.name === icon[1]);
        if (found !== undefined) items.push({ kind: "icon", icon: found, style: current() });
        at += icon[0].length;
        continue;
      }
    }

    if (char === "\n") {
      items.push({ kind: "break" });
      at += 1;
      continue;
    }

    if (char === "\r") {
      at += 1;
      continue;
    }

    const point = String.fromCodePoint(source.codePointAt(at) ?? 0);
    items.push({ kind: "char", char: point, style: current() });
    at += point.length;
  }

  if (items[items.length - 1]?.kind === "break") items.pop();
  return items;
}

function applyTag(
  body: string,
  stack: TextStyle[],
  items: TextItem[],
  sheet: ViewStyleSheet | null,
): void {
  const tag = body.trim();
  const current = stack[stack.length - 1] ?? BASE_STYLE;

  if (tag.startsWith("/")) {
    if (stack.length > 1) stack.pop();
    return;
  }

  const name = (/^[^\s/]+/.exec(tag)?.[0] ?? "").toLowerCase();
  switch (name) {
    case "br":
      items.push({ kind: "break" });
      return;
    case "hr":
      items.push({ kind: "break" }, { kind: "break" });
      return;
    case "b":
      stack.push({ ...current, bold: true });
      return;
    case "i":
      stack.push({ ...current, italic: true });
      return;
    case "u":
    case "a":
      stack.push({ ...current, underline: true });
      return;
    case "s":
      stack.push({ ...current, strike: true });
      return;
    case "font": {
      const hex = FONT_COLOR.exec(tag)?.[1];
      stack.push(hex === undefined ? current : { ...current, color: rgbaOf(hex) });
      return;
    }
    case "li":
      stack.push(current);
      items.push(
        { kind: "char", char: BULLET, style: current },
        { kind: "indent", style: current },
      );
      return;
  }

  const style = sheet?.styles.find((each) => each.name.toLowerCase() === name);
  stack.push(
    style === undefined
      ? current
      : {
          ...current,
          color: style.color ?? current.color,
          bold: style.bold ?? current.bold,
          italic: style.italics ?? current.italic,
          underline: style.underline ?? current.underline,
        },
  );
}

function rgbaOf(hex: string): Rgba {
  const value = Number.parseInt(hex, 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff, 255];
}

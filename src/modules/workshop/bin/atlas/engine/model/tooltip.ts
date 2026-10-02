import type { UiSpellTooltip, UiTexture } from "@/lib/tauri";

import { edgeScale, type LayoutSettings, type PixelRect } from "../layout/solve";
import { type TextExtent, textExtent } from "../text/draws";
import type { TextSource } from "../text/source";
import type { PreviewOverlay } from "./combo";
import type { ViewTree } from "./tree";
import type { View } from "./view";

export type ViewTooltip = NonNullable<View["tooltip"]>;

/** The sections of a tooltip string, each named as its tag and as the text that shows it. */
export const TOOLTIP_SECTIONS = [
  "titleLeft",
  "titleRight",
  "subtitleLeft",
  "subtitleRight",
  "mainText",
  "postScriptTitle",
  "postScriptLeft",
  "postScriptRight",
] as const;

export type TooltipSection = (typeof TOOLTIP_SECTIONS)[number];

export type TooltipSections = Readonly<Record<TooltipSection, string>>;

/** Each section by its tag, lowercase, with `infoArea` another name of `postScriptRight`. */
const SECTION_TAGS: ReadonlyMap<string, TooltipSection> = new Map([
  ...TOOLTIP_SECTIONS.map((section) => [section.toLowerCase(), section] as const),
  ["infoarea", "postScriptRight"],
]);

const OPENING_TAG = /<([A-Za-z]+)>/g;

/** The client's clean pass in order: tabs, a rule with any breaks beside it, then arrows. */
const CLEANING: readonly (readonly [RegExp, string])[] = [
  [/\t/g, " "],
  [/(?:<br\s*\/?>)*<hr\s*\/?>(?:<br\s*\/?>)*/gi, "<br><br>"],
  [/->/g, "%i:rightArrow%"],
  [/<-/g, "%i:leftArrow%"],
];

/**
 * `source` cut into its sections and each cleaned, per "Split" and "Clean" in
 * docs/research/ui-data-layout.md. Text outside every section joins `mainText` where it stands.
 * A section that is not empty comes back wrapped in its own tag, which the sheet styles it by.
 */
export function splitTooltip(source: string): TooltipSections {
  const raw = sectionsOf(() => "");
  const lower = source.toLowerCase();

  let at = 0;
  for (;;) {
    OPENING_TAG.lastIndex = at;
    const tag = OPENING_TAG.exec(source);
    if (tag === null) {
      raw.mainText += source.slice(at);
      break;
    }

    const name = tag[1] ?? "";
    const opened = tag.index + tag[0].length;
    const section = SECTION_TAGS.get(name.toLowerCase());
    if (section === undefined) {
      raw.mainText += source.slice(at, opened);
      at = opened;
      continue;
    }

    const closing = `</${name.toLowerCase()}>`;
    const closed = lower.indexOf(closing, opened);
    const end = closed < 0 ? source.length : closed;
    raw.mainText += source.slice(at, tag.index);
    raw[section] += source.slice(opened, end);
    at = closed < 0 ? source.length : closed + closing.length;
  }

  return sectionsOf((section) => cleaned(raw[section], section));
}

function sectionsOf(value: (section: TooltipSection) => string): Record<TooltipSection, string> {
  const sections = {} as Record<TooltipSection, string>;
  for (const section of TOOLTIP_SECTIONS) sections[section] = value(section);
  return sections;
}

/** One section's text as the client cleans it, wrapped in its tag, and empty for none. */
function cleaned(text: string, section: TooltipSection): string {
  const clean = CLEANING.reduce((each, [pattern, by]) => each.replace(pattern, by), text);
  return clean === "" ? "" : `<${section}>${clean}</${section}>`;
}

/** One ability's tooltip, which a preview fills a tooltip with. */
export interface TooltipSample {
  /** The key that casts the ability, `PASSIVE_SAMPLE` for the passive. */
  readonly id: string;
  readonly name: string;
  /** The key that casts the ability, none for the passive. */
  readonly hotkey: string | null;
  readonly text: string;
  /** The text while Shift is held, none for an ability with no extended tooltip. */
  readonly extended: string | null;
  /** How many ranks the ability has, the top rank its values read at. */
  readonly ranks: number;
  /** The texture the tooltip's icon shows, none to draw the icon off. */
  readonly icon: UiTexture | null;
}

/** The character whose abilities a preview fills a tooltip with first. */
export const DEFAULT_TOOLTIP_CHARACTER = "Ahri";

/** The level that reads as no character at all, as the client reads one: level 1, no stats. */
export const NO_CHARACTER_LEVEL = 0;

/** The top level a sample's values read at, the client's own. */
export const MAX_CHARACTER_LEVEL = 18;

/** The rank a sample's values read at first, an ability's first. */
export const FIRST_RANK = 1;

/** The sample a preview fills a tooltip with first: the first ability's. */
export const DEFAULT_TOOLTIP_SAMPLE = "Q";

/** The id of the sample of the passive, which no key casts. */
export const PASSIVE_SAMPLE = "passive";

/** Each of a character's `tooltips` as a sample, by the key that casts it. */
export function tooltipSamples(tooltips: readonly UiSpellTooltip[] | null): TooltipSample[] {
  return (tooltips ?? []).map((tooltip) => ({
    id: tooltip.hotkey ?? PASSIVE_SAMPLE,
    name: tooltip.name,
    hotkey: tooltip.hotkey,
    text: tooltip.text,
    extended: tooltip.extended,
    ranks: tooltip.ranks,
    icon: tooltip.icon,
  }));
}

/** The sample of `samples` that `id` names, the first where it names none, and none of none. */
export function chooseTooltip(samples: readonly TooltipSample[], id: string): TooltipSample | null {
  return samples.find((each) => each.id === id) ?? samples[0] ?? null;
}

/** `sample` showing the text Shift shows while `extended`, where it has one. */
export function withShift(sample: TooltipSample | null, extended: boolean): TooltipSample | null {
  if (sample === null || !extended || sample.extended === null) return sample;

  return { ...sample, text: sample.extended };
}

/** How a tooltip's parts are found and measured. */
export interface TooltipInputs {
  /** Each part's rect as the file places it. */
  readonly solved: ReadonlyMap<string, PixelRect>;
  /** Screen pixels per pixel an adjustment counts. */
  readonly scale: number;
  /** The extent `text` draws at in the text element `element`, wrapped to `width`. */
  readonly measure: (element: string, text: string, width: number) => TextExtent | null;
}

/** The part of a `PreviewOverlay` a tooltip sets. */
export type TooltipOverlay = Pick<PreviewOverlay, "moved" | "hidden" | "texts">;

/** The texts that end at the tooltip's right edge rather than at their own. */
const RIGHT_SECTIONS: ReadonlySet<TooltipSection> = new Set([
  "titleRight",
  "subtitleRight",
  "postScriptRight",
]);

const HEADER_SECTIONS: readonly TooltipSection[] = [
  "titleLeft",
  "titleRight",
  "subtitleLeft",
  "subtitleRight",
];
const FOOTER_SECTIONS: readonly TooltipSection[] = [
  "postScriptTitle",
  "postScriptLeft",
  "postScriptRight",
];

const NO_EXTENT: TextExtent = { x: 0, y: 0, w: 0, h: 0 };

/** A part's rect relative to the backdrop's top left. */
interface Part extends PixelRect {
  readonly key: string;
}

/** A part as the stack placed it, relative to the backdrop's top left. */
interface Placed {
  readonly key: string;
  rect: PixelRect;
  /** How far right it draws, and null for a line, which spans the backdrop instead. */
  readonly reach: number | null;
  /** It ends at the backdrop's right inset, as a right-hand text does. */
  readonly flush: boolean;
}

/**
 * The tooltip filled with `sample` and laid out as the client lays it, per "What the client does
 * with it" in docs/research/ui-data-layout.md: each section in its text, the parts that show
 * stacked down from the backdrop's top, and the backdrop fitted to them. A part that does not
 * show draws off, as does the caret, which points at no anchor here.
 *
 * The right and bottom insets mirror the texts' left inset _(inferred: the client's fit is not
 * read)_.
 */
export function tooltipOverlay(
  tooltip: ViewTooltip,
  sample: TooltipSample,
  inputs: TooltipInputs,
): TooltipOverlay {
  const { solved, scale, measure } = inputs;
  const adjust = tooltip.adjustments;
  const origin = tooltip.backdrop === null ? undefined : solved.get(tooltip.backdrop);
  if (origin === undefined) return { moved: new Map(), hidden: new Set(), texts: new Map() };

  const partOf = (key: string | null): Part | null => {
    const rect = key === null ? undefined : solved.get(key);
    if (key === null || rect === undefined) return null;
    return { key, x: rect.x - origin.x, y: rect.y - origin.y, w: rect.w, h: rect.h };
  };

  const sections = splitTooltip(sample.text);
  const texts = new Map<string, string>();
  const extents = new Map<TooltipSection, TextExtent>();
  for (const section of TOOLTIP_SECTIONS) {
    const part = partOf(tooltip[section]);
    const text = sections[section];
    if (part === null || text === "") continue;

    texts.set(part.key, text);
    extents.set(section, measure(part.key, text, part.w) ?? NO_EXTENT);
  }

  const shows = (section: TooltipSection) => extents.has(section);
  const icon = sample.icon === null ? null : partOf(tooltip.icon);
  const header = icon !== null || HEADER_SECTIONS.some(shows);
  const hrTop = header && shows("mainText") ? partOf(tooltip.hrTop) : null;
  const hrBottom =
    FOOTER_SECTIONS.some(shows) && shows("mainText") ? partOf(tooltip.hrBottom) : null;

  const placed: Placed[] = [];
  let y = 0;

  /* A text's box at `top`. A left text moves right by `shift`, and a right text clears `after`. */
  const text = (section: TooltipSection, top: number, shift: number, after: number) => {
    const part = partOf(tooltip[section]);
    const extent = extents.get(section);
    if (part === null || extent === undefined) return null;

    const flush = RIGHT_SECTIONS.has(section);
    const x = flush ? Math.max(part.x, after) : part.x + shift;
    const each: Placed = {
      key: part.key,
      rect: { x, y: top + part.y, w: flush ? extent.w : part.w, h: extent.h },
      reach: flush ? x + extent.w : x + extent.x + extent.w,
      flush,
    };
    placed.push(each);
    return each;
  };

  /* A row's bottom, or `y` where neither of its texts shows. */
  const row = (left: TooltipSection, right: TooltipSection, top: number, shift: number) => {
    const first = text(left, top, shift, 0);
    const second = text(right, top, shift, first?.reach ?? 0);
    const bottoms = [first, second].flatMap((each) =>
      each === null ? [] : [each.rect.y + each.rect.h],
    );
    return bottoms.length === 0 ? y : Math.max(...bottoms);
  };

  const line = (hr: Part) => {
    const rect = { x: hr.x, y: y + hr.y, w: hr.w, h: hr.h };
    placed.push({ key: hr.key, rect, reach: null, flush: false });
    y = rect.y + rect.h;
  };

  if (icon !== null) {
    placed.push({ key: icon.key, rect: icon, reach: icon.x + icon.w, flush: false });
  }
  const shift = icon === null ? 0 : icon.w;
  y = row("titleLeft", "titleRight", y + adjust.titleY * scale, shift);
  y = row("subtitleLeft", "subtitleRight", y, shift);
  if (icon !== null) y = Math.max(y, icon.y + icon.h);

  if (hrTop !== null) {
    if (icon === null || !adjust.iconSkipsTopHrPre) y += adjust.topHrYPre * scale;
    line(hrTop);
    y += adjust.topHrYPost * scale;
  }

  const main = text("mainText", y, 0, 0);
  if (main !== null) y = main.rect.y + main.rect.h;

  if (hrBottom !== null) {
    y += adjust.bottomHrYPre * scale;
    line(hrBottom);
    y += adjust.bottomHrYPost * scale;
  }

  const postTitle = text("postScriptTitle", y, 0, 0);
  if (postTitle !== null) y = postTitle.rect.y + postTitle.rect.h;
  row("postScriptLeft", "postScriptRight", y, 0);

  const moved = fitted(placed, adjust.bottomYPadding * scale, origin, tooltip.backdrop);
  const parts = [
    tooltip.icon,
    tooltip.iconOverlay,
    ...TOOLTIP_SECTIONS.map((section) => tooltip[section]),
    tooltip.hrTop,
    tooltip.hrBottom,
    tooltip.hrTopSubScene,
    tooltip.hrBottomSubScene,
    tooltip.caret,
  ];
  const hidden = new Set(parts.filter((key): key is string => key !== null && !moved.has(key)));
  return { moved, hidden, texts };
}

/**
 * The placed parts on screen with the backdrop fitted around them: a right text ending at the
 * right inset and a line spanning the backdrop less its own inset on each side.
 */
function fitted(
  placed: readonly Placed[],
  padding: number,
  origin: PixelRect,
  backdrop: string | null,
): Map<string, PixelRect> {
  const moved = new Map<string, PixelRect>();
  const reaching = placed.filter((each) => each.reach !== null);
  if (reaching.length === 0 || backdrop === null) return moved;

  const inset = Math.min(...reaching.map((each) => each.rect.x));
  const width = Math.max(...reaching.map((each) => each.reach ?? 0)) + inset;
  const bottom = Math.max(...reaching.map((each) => each.rect.y + each.rect.h));
  moved.set(backdrop, { x: origin.x, y: origin.y, w: width, h: bottom + padding + inset });

  for (const { key, rect, reach, flush } of placed) {
    let w = rect.w;
    if (flush) w = width - inset - rect.x;
    else if (reach === null) w = width - 2 * rect.x;
    moved.set(key, { x: origin.x + rect.x, y: origin.y + rect.y, w, h: rect.h });
  }
  return moved;
}

/** What a tooltip is laid out over: the view, its rects and settings, and the text it measures with. */
export interface TooltipScene {
  readonly tree: ViewTree;
  readonly solved: ReadonlyMap<string, PixelRect>;
  readonly settings: LayoutSettings;
  readonly text: TextSource | null;
}

/** `overlay` with the tooltip of the view, where it has one, filled with `sample` and laid out. */
export function withTooltip(
  overlay: PreviewOverlay,
  sample: TooltipSample,
  { tree, solved, settings, text: source }: TooltipScene,
): PreviewOverlay {
  const { tooltip } = tree.view;
  if (tooltip === null || source === null) return overlay;

  const backdrop = tooltip.backdrop === null ? undefined : tree.elements.get(tooltip.backdrop);
  const measure = (key: string, text: string, width: number) => {
    const look = tree.elements.get(key)?.look;
    if (look?.kind !== "text") return null;
    return textExtent(look, width, tree.view, source, settings.screen.height, text);
  };
  const laid = tooltipOverlay(tooltip, sample, {
    solved,
    scale: backdrop === undefined ? settings.hud : edgeScale(backdrop, settings),
    measure,
  });

  return {
    ...overlay,
    moved: new Map([...overlay.moved, ...laid.moved]),
    hidden: new Set([...overlay.hidden, ...laid.hidden]),
    texts: new Map([...overlay.texts, ...laid.texts]),
  };
}

import type { UiAsset, UiShader } from "@/lib/tauri";

import type { Geometry } from "../geometry/quads";
import type { PixelRect } from "../layout/solve";
import type { ViewEffect, ViewTextIcon } from "../model/view";

/** How a draw reaches the frame, per section 2.3 of docs/plans/atlas-renderer.md. */
export type UiBlend = "premultiplied" | "opaque" | "replace";

/** One draw in the client's vertex format with one UI program. */
export interface DrawCommand {
  readonly kind: "draw";
  readonly shader: UiShader;
  /** The index into the view's textures, and null for a program that samples none. */
  readonly texture: number | null;
  readonly geometry: Geometry;
  /** Triangles, or a line strip for a cooldown's hand. */
  readonly primitive: "triangles" | "lineStrip";
  readonly blend: UiBlend;
  /** The effect whose constants the clock and the live input write, where one drives it. */
  readonly effect: DrawnEffect | null;
  readonly scissor: PixelRect | null;
  readonly element: string;
}

/** An effect's class fields, and where its sprite sits for the constants that need it. */
export interface DrawnEffect {
  readonly effect: ViewEffect;
  readonly pass: number;
  /** The drawn rect's centre in 0 to 1 of the screen. */
  readonly centre: readonly [number, number];
  /** The sprite's UV extent, which a flipbook steps over. */
  readonly uvSize: readonly [number, number];
  /** One texel of the sprite's texture in UV, and zero until the texture has loaded. */
  readonly texel: readonly [number, number];
}

/**
 * Vertices in the client's font format, per section 2.5 of docs/plans/atlas-renderer.md: a
 * position in screen pixels, the colour as the bytes of `0xAARRGGBB`, the glyph's page
 * coordinate, and its place in the text's extent for the fill texture.
 */
export interface TextGeometry {
  readonly positions: number[];
  readonly colors: number[];
  readonly texcoords: number[];
  readonly fillTexcoords: number[];
  readonly indices: number[];
}

/** One pass of a text over one glyph page or one inline icon. */
export interface TextCommand {
  readonly kind: "text";
  readonly shader: Extract<UiShader, "font" | "fontOutline" | "fontIcon">;
  readonly glyphs:
    | { readonly kind: "page"; readonly page: number }
    | { readonly kind: "icon"; readonly icon: ViewTextIcon };
  readonly geometry: TextGeometry;
  /** `FONT_COLOR`, `r, g, b, a` from 0 to 1. */
  readonly color: readonly [number, number, number, number];
  /** The texture the fill samples, and white where the font names none. */
  readonly fill: UiAsset | null;
  readonly scissor: PixelRect | null;
  readonly element: string;
}

/**
 * A particle system an element draws at its place in the sort, per section 2.6 of
 * docs/plans/atlas-renderer.md.
 */
export interface ParticleCommand {
  readonly kind: "particles";
  /** The linked `VfxSystemDefinitionData`, by its path or as a hash. */
  readonly system: string;
  /** The centre of the element's rect in screen pixels, which is the system's origin. */
  readonly origin: readonly [number, number];
  /** `VFXAdjustmentScale` times the HUD scale the element takes. */
  readonly scale: number;
  /** The element's source resolution, which the layer takes under bit `0x200` of `flags`. */
  readonly source: readonly [number, number];
  readonly scissor: PixelRect | null;
  readonly element: string;
}

/** An offscreen group opening: what follows draws into a target of its own. */
export interface PushCommand {
  readonly kind: "push";
  readonly group: string;
}

/** An offscreen group closing: its target composites through `Copy` at `alpha`. */
export interface PopCommand {
  readonly kind: "pop";
  readonly group: string;
  readonly alpha: number;
  readonly rect: PixelRect;
  readonly scissor: PixelRect | null;
}

export type Command = DrawCommand | TextCommand | ParticleCommand | PushCommand | PopCommand;

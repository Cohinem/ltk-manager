import type {
  UiAnchor,
  UiEffect,
  UiElement,
  UiFont,
  UiFontFace,
  UiFontResolution,
  UiLayout,
  UiLook,
  UiPosition,
  UiRect,
  UiScene,
  UiSlice,
  UiSprite,
  UiStyleSheet,
  UiTextIcon,
  UiView,
} from "@/lib/tauri";

/**
 * `T` with each float a plain number.
 *
 * specta writes every `f32` as `number | null`, since serde writes a non-finite float as `null`.
 * The resolver writes every float finite, and the view has no optional float, so a
 * `number | null` in these types is always a number. The optional indices `OptionalIndex` names
 * are the exception, and keep their `null`.
 */
type Finite<T> = [T] extends [number | null]
  ? number
  : T extends object
    ? { readonly [K in keyof T]: K extends OptionalIndex ? T[K] : Finite<T[K]> }
    : T;

/** A text's font and style sheet, an index that can be absent rather than a float. */
type OptionalIndex = "font" | "styleSheet";

export type View = Finite<UiView>;
export type ViewScene = Finite<UiScene>;
export type ViewElement = Finite<UiElement>;
export type ViewPosition = Finite<UiPosition>;
export type ViewRect = Finite<UiRect>;
export type ViewAnchor = Finite<UiAnchor>;
export type ViewLayout = Finite<UiLayout>;
export type ViewLook = Finite<UiLook>;
export type ViewSprite = Finite<UiSprite>;
export type ViewSlice = Finite<UiSlice>;
export type ViewEffect = Finite<UiEffect>;
export type ViewFont = Finite<UiFont>;
export type ViewFontFace = Finite<UiFontFace>;
export type ViewFontResolution = Finite<UiFontResolution>;
export type ViewStyleSheet = Finite<UiStyleSheet>;
export type ViewTextIcon = Finite<UiTextIcon>;

/** `view` as the engine reads it, per the finite floats `Finite` names. */
export function finiteView(view: UiView): View {
  return view as unknown as View;
}

/** A font read on its own, as the engine reads a view's. */
export function finiteFont(font: UiFont): ViewFont {
  return font as unknown as ViewFont;
}

import type { UiLoadout, UiRole, UiTexture } from "@/lib/tauri";

import { roleText } from "../text/samples";
import type { PreviewOverlay } from "./combo";
import type { View, ViewLook } from "./view";

const WHOLE: readonly [number, number, number, number] = [0, 0, 1, 1];

/**
 * `view` as its controller fills it with the sample loadout, per "A preview that looks like the
 * game" in docs/plans/atlas-ui-editor.md: each icon or effect a binding names and the file leaves
 * without a sprite draws the loadout's texture, whole, and the view's textures gain those at
 * their end. A spell's desaturate effect draws at its minimum, the spell ready to cast.
 *
 * The answer is for drawing alone. Edits, picks and the inspector read the view as the file holds
 * it, with the same element keys.
 */
export function withLoadout(view: View, loadout: UiLoadout | null): View {
  if (loadout === null || view.bindings.length === 0) return view;

  const filled = new Map<string, UiTexture>();
  for (const binding of view.bindings) {
    const texture = textureOf(binding.role, loadout);
    if (texture !== null) filled.set(binding.element, texture);
  }
  return withTextures(view, filled);
}

/**
 * `view` with each icon or effect `filled` names drawing its texture, whole, where the file leaves
 * it without a sprite, and the view's textures gaining those at their end.
 */
export function withTextures(view: View, filled: ReadonlyMap<string, UiTexture>): View {
  if (filled.size === 0) return view;

  const textures = [...view.textures];
  const indexOf = new Map<string, number>();
  const filledAt = new Map<string, number>();
  for (const [element, texture] of filled) {
    let at = indexOf.get(texture.path);
    if (at === undefined) {
      at = textures.length;
      textures.push(texture);
      indexOf.set(texture.path, at);
    }
    filledAt.set(element, at);
  }

  const elements = view.elements.map((element) => {
    const texture = filledAt.get(element.key);
    if (texture === undefined) return element;

    const look = fill(element.look, texture);
    return look === element.look ? element : { ...element, look };
  });
  return { ...view, textures, elements };
}

/** The text each text element a binding names reads, per `roleText`. */
export function roleTexts(view: View): ReadonlyMap<string, string> {
  const texts = new Map<string, string>();
  for (const binding of view.bindings) {
    const text = roleText(binding.role);
    if (text !== null) texts.set(binding.element, text);
  }
  return texts;
}

/**
 * The elements a binding names that the controller shows only in a state other than rest, and
 * every element whose object path sits under one of theirs.
 */
export function roleHidden(view: View): ReadonlySet<string> {
  const hidden = new Set(
    view.bindings
      .filter((binding) => binding.role.kind === "hidden")
      .map((binding) => binding.element),
  );
  const folders = view.elements
    .filter((element) => hidden.has(element.key) && element.path !== null)
    .map((element) => `${element.path}/`);
  for (const element of view.elements) {
    const path = element.path;
    if (path !== null && folders.some((folder) => path.startsWith(folder))) {
      hidden.add(element.key);
    }
  }
  return hidden;
}

/** `overlay` reading `texts` where it sets no text of its own, and drawing `hidden` off. */
export function withRoles(
  overlay: PreviewOverlay,
  texts: ReadonlyMap<string, string>,
  hidden: ReadonlySet<string>,
): PreviewOverlay {
  if (texts.size === 0 && hidden.size === 0) return overlay;
  return {
    ...overlay,
    texts: new Map([...texts, ...overlay.texts]),
    hidden: new Set([...overlay.hidden, ...hidden]),
  };
}

function fill(look: ViewLook, texture: number): ViewLook {
  const sprite = { texture, uv: WHOLE, name: null, slice: null };
  if (look.kind === "icon" && look.sprite === null) return { ...look, sprite };
  if (look.kind !== "effect" || look.sprite !== null) return look;

  const { effect } = look;
  const ready =
    effect.effect === "desaturate" || effect.effect === "circleMaskDesaturate"
      ? { ...effect, maximum: effect.minimum }
      : effect;
  return { ...look, sprite, effect: ready };
}

/** The loadout's texture for an element of `role`, none for a role that fills text. */
function textureOf(role: UiRole, loadout: UiLoadout): UiTexture | null {
  switch (role.kind) {
    case "ability":
      return loadout.abilities[role.slot] ?? null;
    case "passive":
    case "buff":
      return loadout.passive;
    case "summoner":
      return loadout.summoners[role.slot] ?? null;
    case "item":
      return loadout.items[role.slot] ?? null;
    case "portrait":
      return loadout.portrait;
    case "splash":
      return loadout.splash;
    case "keystone":
      return loadout.keystone;
    case "substyle":
      return loadout.substyle;
    default:
      return null;
  }
}

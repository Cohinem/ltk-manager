import { useEffect } from "react";

import { ACCENT_PRESETS, ACCENT_ROOT_KEYS, applyAccent } from "@/modules/settings";

/** `app` leaves the reader's own setting in place. */
export type ThemeCondition = "app" | "dark" | "light";

/** `app` leaves the reader's own accent, `ltk` is the brand ramp, and the rest name a preset. */
export type AccentCondition = string;

export const ACCENT_CONDITIONS: AccentCondition[] = ["app", "ltk", ...Object.keys(ACCENT_PRESETS)];

/** The surface rung the cases are drawn on. */
export type Ground = "950" | "900" | "800";

/** What the gallery forces on the document while it is open. */
export interface Conditions {
  theme: ThemeCondition;
  accent: AccentCondition;
  zeroTint: boolean;
  reduceMotion: boolean;
}

export const APP_CONDITIONS: Conditions = {
  theme: "app",
  accent: "app",
  zeroTint: false,
  reduceMotion: false,
};

const ATTRIBUTES = ["data-theme", "data-reduce-motion", ...ACCENT_ROOT_KEYS.attributes];
const PROPERTIES = ["--surface-tint", ...ACCENT_ROOT_KEYS.properties];

/**
 * Force `conditions` on the document root, and put the app's own values back on the way out.
 *
 * The values are read when a condition is applied, so a setting the reader changes while the
 * gallery overrides it is restored to what it was before the change.
 */
export function useRootConditions(conditions: Conditions): void {
  const { theme, accent, zeroTint, reduceMotion } = conditions;

  useEffect(() => {
    const root = document.documentElement;
    const attributes = ATTRIBUTES.map((name) => [name, root.getAttribute(name)] as const);
    const properties = PROPERTIES.map((name) => [name, root.style.getPropertyValue(name)] as const);

    if (theme !== "app") {
      root.setAttribute("data-theme", theme);
    }

    if (accent !== "app") {
      applyAccent(root, ACCENT_PRESETS[accent] ?? null);
    }

    if (zeroTint) {
      root.style.setProperty("--surface-tint", "0");
    }

    if (reduceMotion) {
      root.setAttribute("data-reduce-motion", "true");
    }

    return () => {
      for (const [name, value] of attributes) {
        if (value === null) root.removeAttribute(name);
        else root.setAttribute(name, value);
      }

      for (const [name, value] of properties) {
        if (value === "") root.style.removeProperty(name);
        else root.style.setProperty(name, value);
      }
    };
  }, [theme, accent, zeroTint, reduceMotion]);
}

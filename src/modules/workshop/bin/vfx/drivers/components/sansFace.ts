import { useMemo, useSyncExternalStore } from "react";

import { type MeasureText, type SansFont, textMeasure } from "../utils/textWidth";

/* The custom properties the root layout writes once the reader's face has loaded. */
const FACE = "--face-sans";
const WEIGHTS = ["--weight-normal", "--weight-medium"] as const;

/**
 * A text measure in the face the document draws in, made again when the reader picks another.
 *
 * The face is read off the root's style, which the root layout writes only after the face has
 * loaded, so a measure never runs in the fallback stack.
 */
export function useTextMeasure(): MeasureText {
  const key = useSyncExternalStore(subscribe, fontKey, noFont);
  return useMemo(() => textMeasure(fontOf(key)), [key]);
}

function subscribe(listener: () => void): () => void {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
  return () => observer.disconnect();
}

/** The face and its weights as one string, so the store compares them by value. */
function fontKey(): string {
  const root = getComputedStyle(document.documentElement);
  return [FACE, ...WEIGHTS].map((name) => root.getPropertyValue(name).trim()).join("\n");
}

function noFont(): string {
  return "";
}

function fontOf(key: string): SansFont | null {
  const [face = "", normal = "", medium = ""] = key.split("\n");
  if (face === "") return null;

  return { face, normal: normal || "400", medium: medium || "500" };
}

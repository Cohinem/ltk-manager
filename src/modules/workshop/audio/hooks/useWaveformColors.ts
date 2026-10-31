import { useEffect, useState } from "react";

/** The tokens the waveform canvas is painted in (DS-TOKEN). */
const TOKENS = {
  wave: "--color-surface-500",
  progress: "--color-accent-400",
  cursor: "--color-surface-100",
} as const;

/** The resolved colors of the waveform view, as CSS a canvas reads. */
export type WaveformColors = Record<keyof typeof TOKENS, string>;

/** The root attributes that move a token: the theme, and the accent written on it. */
const THEMED = ["data-theme", "style", "class"];

/**
 * Resolves `token` to a computed color.
 *
 * The tokens are `var()` chains, which a canvas does not read, so a probe element resolves them.
 */
function resolvedColor(token: string): string {
  const probe = document.createElement("span");
  probe.style.display = "none";
  probe.style.color = `var(${token})`;
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

function waveformColors(): WaveformColors {
  return {
    wave: resolvedColor(TOKENS.wave),
    progress: resolvedColor(TOKENS.progress),
    cursor: resolvedColor(TOKENS.cursor),
  };
}

/** Returns the waveform's colors, and reads them again when the theme or the accent changes. */
export function useWaveformColors(): WaveformColors {
  const [colors, setColors] = useState(waveformColors);

  useEffect(() => {
    const observer = new MutationObserver(() => setColors(waveformColors()));
    observer.observe(document.documentElement, { attributeFilter: THEMED });
    return () => observer.disconnect();
  }, []);

  return colors;
}

import type { MediaReplacement } from "@/lib/tauri";

/** The extensions that the file dialog of Replace media offers. Per "Replacing media". */
export const REPLACE_EXTENSIONS = ["wem", "wav", "ogg", "flac"] as const;

/** A format fact of a media that a replacement changes. */
export type FormatChange = "codec" | "channels" | "rate";

/** Returns the format facts that differ between the media before and after `replacement`. */
export function formatChanges(replacement: MediaReplacement): FormatChange[] {
  const before = replacement.before.format;
  const after = replacement.after.format;
  if (before === null || after === null) return [];

  const changes: FormatChange[] = [];
  if (before.codec !== after.codec) changes.push("codec");
  if (before.channels !== after.channels) changes.push("channels");
  if (before.sampleRate !== after.sampleRate) changes.push("rate");
  return changes;
}

/**
 * Returns `true` if a replacement asks before it writes: when several sounds share the media,
 * when a sound of another bank plays it, or when its format changes.
 */
export function asksBeforeReplace(replacement: MediaReplacement): boolean {
  return (
    replacement.sounds.length > 1 ||
    replacement.sounds.some((sound) => !sound.opened) ||
    formatChanges(replacement).length > 0
  );
}

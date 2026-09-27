import type { EmitterRef } from "./emitterCopy";

/** The emitter actions of an open system. A document that takes no edit copies alone. */
export interface EmitterClipboard {
  readonly copy: (emitter: EmitterRef) => Promise<void>;
  /** Null where the document takes no edit. */
  readonly duplicate: ((emitter: EmitterRef) => Promise<void>) | null;
  /** Land the clipboard's emitter in the system `entry`, after `after` or else last. */
  readonly paste: ((entry: string, after: EmitterRef | null) => Promise<void>) | null;
}

/** The keys of a chord, as a keyboard event carries them. */
interface Chord {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

/**
 * Run what Ctrl+D, Ctrl+C or Ctrl+V asks of the emitter `picked`, answering whether one ran.
 *
 * Duplicate and copy need a picked emitter, and a paste lands after it or at the end.
 */
export function runEmitterKey(
  chord: Chord,
  clipboard: EmitterClipboard | null,
  entry: string,
  picked: EmitterRef | null,
): boolean {
  if (clipboard === null || entry === "") return false;
  if (!(chord.ctrlKey || chord.metaKey) || chord.shiftKey || chord.altKey) return false;

  const { copy, duplicate, paste } = clipboard;
  switch (chord.key.toLowerCase()) {
    case "d":
      if (picked === null || duplicate === null) return false;
      void duplicate(picked);
      return true;
    case "c":
      if (picked === null) return false;
      void copy(picked);
      return true;
    case "v":
      if (paste === null) return false;
      void paste(entry, picked);
      return true;
    default:
      return false;
  }
}

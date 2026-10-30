/** How a value entry closes: Enter, Escape, or a press or focus outside it. */
export type EntryClose = "enter" | "escape" | "outside";

/** The text of an open value entry and the text it opened with. */
export interface EntryDraft {
  readonly text: string;
  readonly initial: string;
}

/** What a value entry does as it closes. */
export type EntryOutcome =
  | { readonly kind: "commit"; readonly value: number }
  | { readonly kind: "cancel" }
  /** The entry stays open with its text marked. */
  | { readonly kind: "invalid" };

/**
 * Returns what `draft` does when the entry closes by `close`.
 *
 * Escape and a text left as it opened cancel, so a prefill that rounds the value writes nothing.
 * A text that holds no number keeps the entry open on Enter and cancels on a press outside.
 */
export function entryOutcome(
  close: EntryClose,
  draft: EntryDraft,
  parse: (text: string) => number | null,
): EntryOutcome {
  if (close === "escape" || draft.text === draft.initial) return { kind: "cancel" };

  const value = parse(draft.text);
  if (value === null) return close === "enter" ? { kind: "invalid" } : { kind: "cancel" };

  return { kind: "commit", value };
}

/**
 * Returns the number that `text` holds, with or without `unit` typed after it.
 *
 * The unit matches in any case. Returns null if the text holds no finite number.
 */
export function parseNumberText(text: string, unit?: string): number | null {
  let trimmed = text.trim();
  if (unit !== undefined && trimmed.toLowerCase().endsWith(unit.toLowerCase())) {
    trimmed = trimmed.slice(0, trimmed.length - unit.length).trim();
  }
  if (trimmed === "") return null;

  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

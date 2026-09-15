import type { ClassChoice } from "@/lib/tauri";

/** One class a class line offers: a choice the backend answered, or the text as typed. */
export type ClassSuggestion =
  | { readonly kind: "choice"; readonly choice: ClassChoice }
  | { readonly kind: "typed"; readonly text: string };

/**
 * The classes a class line offers for `text`.
 *
 * The choices whose name holds the text, the ones it starts first, and the text itself last
 * where no choice is named that. Empty text offers every choice in the order it came.
 */
export function classSuggestions(choices: readonly ClassChoice[], text: string): ClassSuggestion[] {
  const term = text.trim().toLowerCase();
  const named = (choice: ClassChoice) => (choice.name ?? choice.hash).toLowerCase();
  const matching = choices.filter(
    (choice) => named(choice).includes(term) || choice.hash.toLowerCase() === term,
  );
  const ordered = [
    ...matching.filter((choice) => named(choice).startsWith(term)),
    ...matching.filter((choice) => !named(choice).startsWith(term)),
  ];
  const suggestions: ClassSuggestion[] = ordered.map((choice) => ({ kind: "choice", choice }));
  if (term !== "" && !choices.some((choice) => named(choice) === term)) {
    suggestions.push({ kind: "typed", text: text.trim() });
  }
  return suggestions;
}

/** The class text a suggestion sends: a choice's hash, or the text as typed. */
export function classWire(suggestion: ClassSuggestion): string {
  return suggestion.kind === "choice" ? suggestion.choice.hash : suggestion.text;
}

/** The words a suggestion reads as. */
export function classLabel(suggestion: ClassSuggestion): string {
  if (suggestion.kind === "typed") return suggestion.text;
  return suggestion.choice.name ?? suggestion.choice.hash;
}

/** A key as a person types one, without the quotes a named key is drawn in. */
export function typedKey(text: string): string {
  const trimmed = text.trim();
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return typeof parsed === "string" ? parsed : trimmed;
  } catch {
    return trimmed;
  }
}

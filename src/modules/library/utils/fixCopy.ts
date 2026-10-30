import type { RuleId } from "@/lib/tauri";
import { m } from "@/paraglide/messages";

/**
 * Returns the note that says what the fix of the rule `rule` changes, from the catalog keys of
 * the rule id.
 *
 * Returns `null` if the catalog has no note for the fix of the rule.
 */
export function fixNote(rule: RuleId): string | null {
  if (rule === "bin/skinhack") return m["rule.bin/skinhack.fix.description"]();

  return null;
}

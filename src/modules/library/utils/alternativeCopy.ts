import type { FixAlternative, RuleId } from "@/lib/tauri";
import { m } from "@/paraglide/messages";

/** The title and the note that an alternative repair draws. */
export interface AlternativeCopy {
  readonly title: string;
  readonly note: string | null;
}

/**
 * Returns the copy of `alternative` of the rule `rule`, from the catalog keys of the rule id.
 *
 * Returns the alternative's id as the title and no note if the catalog has no copy for it.
 */
export function alternativeCopy(rule: RuleId, alternative: FixAlternative): AlternativeCopy {
  if (rule === "audio/bank-version" && alternative.id === "convert") {
    const zeroed = (alternative.caveats ?? []).includes("attenuationFlagZeroed");

    return {
      title: m["rule.audio/bank-version.convert.title"](),
      note: zeroed
        ? m["rule.audio/bank-version.convert.attenuation.description"]()
        : m["rule.audio/bank-version.convert.description"](),
    };
  }

  return { title: alternative.id, note: null };
}

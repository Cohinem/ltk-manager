import { m } from "@/i18n";
import type { FixFacts, FixPreview, SkinAudioRepair } from "@/lib/tauri";

/**
 * Returns the note that a row draws for `fix`, from the catalog keys of the rule id if the
 * preview carries facts.
 *
 * Returns the preview's own note if it has no facts, and `null` if it has neither.
 */
export function previewNote(fix: FixPreview): string | null {
  if (fix.facts) return factsNote(fix.facts);

  return fix.note ?? null;
}

function factsNote(facts: FixFacts): string {
  switch (facts.kind) {
    case "skinAudio":
      return skinAudioNote(facts);
  }
}

function skinAudioNote(repair: SkinAudioRepair): string {
  const sentences = [removedSentence(repair)];

  if (repair.addedUnits.length > 0) {
    sentences.push(
      m["rule.bin/skinhack.fix.added.description"]({
        units: listed(repair.addedUnits),
        count: repair.addedUnits.length,
      }),
    );
  }

  if (repair.renamedEvents > 0) {
    sentences.push(m["rule.bin/skinhack.fix.renamed.description"]({ count: repair.renamedEvents }));
  }

  if (repair.silentClipEvents > 0) {
    sentences.push(
      m["rule.bin/skinhack.fix.silent-clips.description"]({ count: repair.silentClipEvents }),
    );
  }

  if (repair.silentVfxEvents > 0) {
    sentences.push(
      m["rule.bin/skinhack.fix.silent-vfx.description"]({ count: repair.silentVfxEvents }),
    );
  }

  return sentences.filter((sentence) => sentence !== null).join(" ");
}

/** Returns the sentence of the removed units and tags, or `null` if the repair removes neither. */
function removedSentence({ removedUnits, removedTags }: SkinAudioRepair): string | null {
  const units = { units: listed(removedUnits), count: removedUnits.length };
  const tags = { tags: listed(removedTags), count: removedTags.length };

  if (removedUnits.length > 0 && removedTags.length > 0) {
    return m["rule.bin/skinhack.fix.removed-units-and-tags.description"]({
      units: units.units,
      unitCount: units.count,
      tags: tags.tags,
      tagCount: tags.count,
    });
  }

  if (removedUnits.length > 0) return m["rule.bin/skinhack.fix.removed-units.description"](units);
  if (removedTags.length > 0) return m["rule.bin/skinhack.fix.removed-tags.description"](tags);

  return null;
}

/** Joins the names of `values` the way the before and the after values of a preview join them. */
function listed(values: readonly string[]): string {
  return values.join(", ");
}

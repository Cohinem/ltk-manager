import { m } from "@/i18n";
import type {
  Audience,
  AudienceLine,
  AudioAction,
  VoiceLines,
  VoiceRule,
  VoiceSituation,
} from "@/lib/tauri";

import { conditionText, lastSegment } from "./voiceConditions";

/** The audiences of a rule's action as the row draws them. */
export interface AudienceSummary {
  /** The audiences with a non-empty short name, in field order. */
  readonly audiences: readonly Audience[];
  /** The line the row draws: the owner's, else the first with a name. */
  readonly line: AudienceLine | null;
  /** `true` if the named audiences do not all name the same short name. */
  readonly mixed: boolean;
}

/** Returns the audiences of `audio` and the one line the row draws. */
export function audienceSummary(audio: AudioAction | null): AudienceSummary {
  const named = audio?.lines.filter((line) => line.short !== "") ?? [];
  const [first] = named;

  return {
    audiences: named.map((line) => line.audience),
    line: first ?? null,
    mixed: named.some((line) => line.short !== first?.short),
  };
}

/** The keys of the view's rows, so a fold, a pick and a focus request agree. */
export function situationKey(situation: VoiceSituation): string {
  return `s:${situation.path}`;
}

export function ruleKey(rule: VoiceRule): string {
  return `r:${rule.path}`;
}

export function addKey(situation: VoiceSituation): string {
  return `a:${situation.path}`;
}

/** One row of the Voice lines view. */
export type VoiceLineRow =
  | {
      readonly kind: "situation";
      readonly key: string;
      readonly parent: null;
      readonly depth: 0;
      readonly expandable: true;
      readonly open: boolean;
      readonly situation: VoiceSituation;
    }
  | {
      readonly kind: "rule";
      readonly key: string;
      readonly parent: string;
      readonly depth: 1;
      readonly expandable: false;
      readonly open: false;
      readonly situation: VoiceSituation;
      readonly rule: VoiceRule;
      /** The position of the rule in `mRules`. */
      readonly index: number;
    }
  | {
      readonly kind: "add";
      readonly key: string;
      readonly parent: string;
      readonly depth: 1;
      readonly expandable: false;
      readonly open: false;
      readonly situation: VoiceSituation;
    };

/** What the rows of the view keep: an unresolved line only, and the text filter. */
export interface RowFilter {
  readonly text: string;
  readonly unresolved: boolean;
}

/** Returns `true` if a short name of `rule` composes no event of the chosen skin's banks. */
export function isUnresolved(rule: VoiceRule): boolean {
  return rule.audio?.lines.some((line) => line.short !== "" && line.event === null) ?? false;
}

/** Returns the number of rules of `lines` that `isUnresolved` marks. */
export function unresolvedCount(lines: VoiceLines): number {
  return lines.situations.reduce(
    (sum, situation) => sum + situation.rules.filter(isUnresolved).length,
    0,
  );
}

function matches(rule: VoiceRule, situation: VoiceSituation, text: string): boolean {
  if (text === "") return true;

  const needle = text.toLowerCase();
  const haystack = [
    rule.name ?? "",
    situation.name ?? "",
    ...(rule.audio?.lines.flatMap((line) => [line.short, line.event?.name ?? ""]) ?? []),
    ...rule.conditions.map(conditionText),
  ];
  return haystack.some((each) => each.toLowerCase().includes(needle));
}

/**
 * Returns the rows of `lines`: a header per situation, then its rules and its add row while it is
 * open.
 *
 * A situation is open unless `folded` holds its key. A filter keeps the rules whose name,
 * situation, short names, events or conditions contain its text, and the situations with a kept
 * rule. `editable` adds the add rows.
 */
export function voiceLineRows(
  lines: VoiceLines,
  folded: ReadonlySet<string>,
  filter: RowFilter,
  editable: boolean,
): VoiceLineRow[] {
  const rows: VoiceLineRow[] = [];
  const filtering = filter.text !== "" || filter.unresolved;

  for (const situation of lines.situations) {
    const key = situationKey(situation);
    const kept = situation.rules
      .map((rule, index) => ({ rule, index }))
      .filter(
        ({ rule }) =>
          matches(rule, situation, filter.text) && (!filter.unresolved || isUnresolved(rule)),
      );
    if (filtering && kept.length === 0) continue;

    const open = !folded.has(key);
    rows.push({
      kind: "situation",
      key,
      parent: null,
      depth: 0,
      expandable: true,
      open,
      situation,
    });
    if (!open) continue;

    for (const { rule, index } of kept) {
      rows.push({
        kind: "rule",
        key: ruleKey(rule),
        parent: key,
        depth: 1,
        expandable: false,
        open: false,
        situation,
        rule,
        index,
      });
    }
    if (editable && !filtering) {
      rows.push({
        kind: "add",
        key: addKey(situation),
        parent: key,
        depth: 1,
        expandable: false,
        open: false,
        situation,
      });
    }
  }
  return rows;
}

/** One situation of the view: its header row and the rows under it. */
export interface RowGroup {
  readonly key: string;
  readonly rows: readonly { readonly row: VoiceLineRow; readonly index: number }[];
}

/** Returns `rows` split into one group per situation header, each row with its index in `rows`. */
export function rowGroups(rows: readonly VoiceLineRow[]): RowGroup[] {
  const groups: { key: string; rows: { row: VoiceLineRow; index: number }[] }[] = [];

  rows.forEach((row, index) => {
    const last = groups.at(-1);
    if (row.kind === "situation" || last === undefined) {
      groups.push({ key: row.key, rows: [{ row, index }] });
      return;
    }

    last.rows.push({ row, index });
  });
  return groups;
}

/**
 * Returns the tag of `tags` that the composed event name `event` starts with, such as `LuxSkin07`
 * for `Play_vo_LuxSkin07_Move2DFirst`.
 *
 * The longest tag wins, as in `compose_vo_names`. Returns null if no tag composes the name.
 */
export function resolvedTag(event: string, tags: readonly string[]): string | null {
  const name = event.toLowerCase();
  let best: string | null = null;

  for (const tag of tags) {
    const prefix = `play_vo_${tag.toLowerCase()}_`;
    if (name.startsWith(prefix) && tag.length > (best?.length ?? 0)) best = tag;
  }
  return best;
}

/** The situation words of the named keys a modder meets most. "Situation words" in the doc. */
const SITUATION_WORDS: Readonly<Record<string, () => string>> = {
  moveorder2d: m.audio_voice_situation_move_label,
  firstmove2d: m.audio_voice_situation_first_move_label,
  attackchampion2d: m.audio_voice_situation_attack_label,
  attackneutral2d: m.audio_voice_situation_attack_label,
  attackminion2d: m.audio_voice_situation_attack_label,
  attackbuilding2d: m.audio_voice_situation_attack_label,
  spellcast: m.audio_voice_situation_spell_cast_label,
  spellhit: m.audio_voice_situation_spell_hit_label,
  enemyencounter: m.audio_voice_situation_encounter_label,
  killchampion: m.audio_voice_situation_kill_label,
  killturret: m.audio_voice_situation_kill_turret_label,
  respawn2d: m.audio_voice_situation_respawn_label,
  recallleadin: m.audio_voice_situation_recall_label,
  recall: m.audio_voice_situation_recall_label,
  taunt: m.audio_voice_situation_taunt_label,
  laugh: m.audio_voice_situation_laugh_label,
  joke: m.audio_voice_situation_joke_label,
  dance: m.audio_voice_situation_dance_label,
  buyitem: m.audio_voice_situation_buy_item_label,
  useitem: m.audio_voice_situation_use_item_label,
  gotfirstblood: m.audio_voice_situation_first_blood_label,
};

/** Returns the word of a situation `name`, the name itself where no word fits, or null. */
export function situationWord(name: string | null): string | null {
  if (name === null) return null;

  return SITUATION_WORDS[name.toLowerCase()]?.() ?? name;
}

/**
 * Returns the object path that "Copy for this skin" gives the copy of `object` for the skin bin
 * `bin`, such as `Characters/Lux/CAC/Lux_Skin07` for `Characters/Lux/CAC/Lux_Base` and
 * `data/characters/lux/skins/skin7.bin`.
 *
 * The last segment's suffix after its last `_` becomes `SkinNN`, and a segment without one takes
 * `_SkinNN` after it. Returns null for a bin that is not a `skinN.bin`.
 */
export function copyObjectName(object: string, bin: string): string | null {
  const match = /skin(\d+)\.bin$/i.exec(bin);
  if (match?.[1] === undefined) return null;

  const skin = `Skin${match[1].padStart(2, "0")}`;
  const slash = object.lastIndexOf("/");
  const head = object.slice(0, slash + 1);
  const last = object.slice(slash + 1);
  const underscore = last.lastIndexOf("_");
  const stem = underscore < 0 ? last : last.slice(0, underscore);
  return `${head}${stem}_${skin}`;
}

/** Returns the skin label of a skin bin, such as `Skin 7` for `.../skins/skin7.bin`. */
export function skinLabel(bin: string): string {
  const match = /skin(\d+)\.bin$/i.exec(bin);
  if (match?.[1] === undefined) return lastSegment(bin);

  return m.audio_voice_skin_label({ number: String(Number(match[1])) });
}

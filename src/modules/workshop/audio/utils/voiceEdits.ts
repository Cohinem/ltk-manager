import type {
  Audience,
  BinEdit,
  LeafValue,
  ValueEdit,
  VoiceRule,
  VoiceSituation,
} from "@/lib/tauri";

import { fnv1a32, nameHash } from "../../bin/shared/utils/binHash";
import { CLASS, type RuleChance } from "./voiceConditions";

/** The field of `ContextualActionData` that every edit of the view addresses. */
export const SITUATIONS_FIELD = nameHash("mSituations");

/** A field's hash as a hash path writes it: eight hex digits. */
export function fieldHex(name: string): string {
  return fnv1a32(name).toString(16).padStart(8, "0");
}

/** Returns the hash path of the field `name` under the struct at `path`. */
export function fieldPath(path: string, name: string): string {
  return path === "" ? fieldHex(name) : `${path}.${fieldHex(name)}`;
}

/** Returns an edit of the `mSituations` field of the object `entry`, as one undoable step. */
export function situationsEdit(entry: string, edits: readonly ValueEdit[]): BinEdit {
  return { kind: "editProperty", entry, holder: "", field: SITUATIONS_FIELD, edits: [...edits] };
}

/**
 * Returns the edits that set the field `field` of the struct at `path` to `value`, adding the
 * field at its default first where the struct does not write it.
 */
export function fieldEdits(path: string, field: string, value: LeafValue): ValueEdit[] {
  return [
    { type: "ensureProperty", path, field: nameHash(field) },
    { type: "setLeaf", path: fieldPath(path, field), value },
  ];
}

/** Returns the edits that set the percent of each chance of `chances` to `percent`. */
export function chanceEdits(chances: readonly RuleChance[], percent: number): ValueEdit[] {
  const clamped = Math.round(Math.min(100, Math.max(0, percent)));
  return chances.flatMap((chance) =>
    fieldEdits(chance.path, "mPercentChanceToPlay", { type: "integer", text: String(clamped) }),
  );
}

/** The class of the condition that the chance knob draws. */
const CHANCE_CLASS = "ContextualConditionChanceToPlay";

/**
 * Returns the edits that add a chance condition of `percent` to each of `rules` that has none.
 *
 * The condition lands at the end of `mConditions`, which the rule gains first where it does not
 * write it.
 */
export function addChanceEdits(rules: readonly VoiceRule[], percent: number): ValueEdit[] {
  return rules.flatMap((rule): ValueEdit[] => {
    if (rule.conditions.some((condition) => condition.class === CLASS.chance)) return [];

    const list = conditionsPath(rule);
    const added = `${list}[${rule.conditions.length}]`;
    return [
      { type: "ensureProperty", path: rule.path, field: nameHash("mConditions") },
      { type: "insertItem", path: list, item: { index: null, key: null, class: CHANCE_CLASS } },
      ...chanceEdits([{ path: added, percent }], percent),
    ];
  });
}

/** Returns the edits that remove every chance condition of `rules`. */
export function removeChanceEdits(rules: readonly VoiceRule[]): ValueEdit[] {
  return removeEdits(
    rules.flatMap((rule) =>
      rule.conditions
        .filter((condition) => condition.class === CLASS.chance)
        .map((condition) => condition.path),
    ),
  );
}

/** Returns the edits that set or clear the `mPriority` of the rule at `path`. */
export function priorityEdits(path: string, priority: number | null): ValueEdit[] {
  const option = fieldPath(path, "mPriority");
  if (priority === null) return [{ type: "removeItem", path: `${option}[0]` }];

  return fieldEdits(path, "mPriority", { type: "integer", text: String(Math.round(priority)) });
}

/** Returns the edit that sets the short name of `audience` of the rule at `path`. */
export function shortNameEdits(path: string, audience: Audience, short: string): ValueEdit[] {
  const action = fieldPath(path, "mAudioAction");
  return [
    { type: "ensurePointer", path: action, class: "ContextualActionPlayVO" },
    ...fieldEdits(action, AUDIENCE_FIELD[audience], { type: "string", value: short }),
  ];
}

/** The field of `ContextualActionPlayAudio` that holds the short name of each audience. */
export const AUDIENCE_FIELD: Readonly<Record<Audience, string>> = {
  owner: "mSelfEventName",
  ally: "mAllyEventName",
  enemy: "mEnemyEventName",
  spectator: "mSpectatorEventName",
};

/** Returns the hash path of the `mRules` list of `situation`. */
export function rulesPath(situation: VoiceSituation): string {
  return fieldPath(situation.path, "mRules");
}

/** Returns the hash path of the `mConditions` list of `rule`. */
export function conditionsPath(rule: VoiceRule): string {
  return fieldPath(rule.path, "mConditions");
}

/** Returns the edits that copy each of `rules`, at `index`s in `situation`, after itself. */
export function duplicateEdits(
  situation: VoiceSituation,
  picked: readonly { readonly rule: VoiceRule; readonly index: number }[],
): ValueEdit[] {
  const ordered = [...picked].sort((left, right) => right.index - left.index);
  return ordered.map(({ rule, index }) => ({
    type: "copyItem",
    from: rule.path,
    path: rulesPath(situation),
    index: index + 1,
    unique: null,
  }));
}

/** Returns the edits that remove each of `paths`, the last item of a list first. */
export function removeEdits(paths: readonly string[]): ValueEdit[] {
  return [...paths]
    .sort((left, right) => itemIndex(right) - itemIndex(left))
    .map((path) => ({ type: "removeItem", path }));
}

/** Returns the index that a path's last `[i]` names, or -1. */
function itemIndex(path: string): number {
  const match = /\[(\d+)\]$/.exec(path);
  return match?.[1] === undefined ? -1 : Number(match[1]);
}

/** Returns the hash path from the object's root of `path`, a path under `mSituations`. */
export function objectPath(path: string): string {
  const field = fieldHex("mSituations");
  if (path === "") return field;

  return path.startsWith("[") || path.startsWith("{") ? `${field}${path}` : `${field}.${path}`;
}

/** Returns the edit that sets the `mCooldown` of the object `entry`, the shared cooldown. */
export function cooldownEdit(entry: string, seconds: number): BinEdit {
  return {
    kind: "patch",
    entry,
    path: fieldHex("mCooldown"),
    value: { type: "float", value: seconds },
  };
}

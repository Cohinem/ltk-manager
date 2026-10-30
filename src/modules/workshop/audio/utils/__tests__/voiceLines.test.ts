import { describe, expect, it } from "vitest";

import type {
  AudienceLine,
  EventContext,
  VoiceCondition,
  VoiceConditionField,
  VoiceLines,
  VoiceRule,
  VoiceSituation,
} from "@/lib/tauri";

import { fnv1a32 } from "../../../bin/shared/utils/binHash";
import { playedBy } from "../playedBy";
import { conditionText, ruleChance } from "../voiceConditions";
import { chanceEdits, objectPath } from "../voiceEdits";
import { topicEdits } from "../voiceFieldTopics";
import { copyObjectName, voiceLineRows } from "../voiceLines";
import { simulateTrigger, type TriggerContext } from "../voiceTrigger";

function field(name: string, value: VoiceConditionField["value"]): VoiceConditionField {
  return { field: fnv1a32(name), name, value };
}

function condition(className: string, path: string, fields: VoiceConditionField[]): VoiceCondition {
  return { class: fnv1a32(className), className, path, fields };
}

const chance = (path: string, percent: number) =>
  condition("ContextualConditionChanceToPlay", path, [
    field("mPercentChanceToPlay", { kind: "integer", value: percent }),
  ]);

const spell = (path: string, name: string) =>
  condition("ContextualConditionSpellName", path, [
    field("mSpell", { kind: "hash", hash: { hash: 1, name: `Characters/Lux/Spells/${name}` } }),
  ]);

const otherIs = (path: string, champion: string) =>
  condition("ContextualConditionCharacter", path, [
    field("mCharacterType", { kind: "integer", value: 1 }),
    field("mChildConditions", {
      kind: "list",
      items: [
        {
          kind: "object",
          condition: condition("ContextualConditionCharacterName", `${path}.c`, [
            field("mCharacters", {
              kind: "list",
              items: [
                {
                  kind: "hash",
                  hash: { hash: 2, name: `Characters/${champion}/CharacterRecords/Root` },
                },
              ],
            }),
          ]),
        },
      ],
    }),
  ]);

function line(short: string, event: string | null = null): AudienceLine {
  return {
    audience: "owner",
    short,
    event: event === null ? null : { id: 1, name: event, bank: "vo_events.bnk", asset: null },
    candidates: [],
  };
}

function rule(path: string, overrides: Partial<VoiceRule> = {}): VoiceRule {
  return {
    path,
    name: path,
    relationship: 0,
    priority: null,
    stompLower: true,
    canStompSelf: false,
    activeVoiceOver: true,
    overrideCooldown: false,
    cooldownModifications: null,
    chanceWeight: 1,
    conditions: [],
    audio: {
      class: 0,
      maxOccurrences: 0,
      waitForAnnouncer: false,
      waitTimeout: 0,
      lines: [line("cast3D", "Play_vo_Lux_cast3D")],
    },
    animation: null,
    trigger: null,
    ...overrides,
  };
}

function situation(rules: VoiceRule[], chooseRandom = false): VoiceSituation {
  return { key: 7, name: "SpellCast", path: "{00000007}", chooseRandom, cooldown: 0, rules };
}

const ANY: TriggerContext = { target: null, spell: null, audience: "owner" };

/** Returns a random source that answers `values` in turn, then the last one. */
function sequence(...values: number[]): () => number {
  let at = 0;
  return () => values[Math.min(at++, values.length - 1)] ?? 0;
}

describe("simulateTrigger", () => {
  it("plays the first rule whose chance roll passes", () => {
    const first = rule("a", { conditions: [chance("a.c", 30)] });
    const second = rule("b", { conditions: [chance("b.c", 50)] });

    const played = simulateTrigger(situation([first, second]), ANY, sequence(0.4, 0.2));

    expect(played?.path).toBe("b");
  });

  it("skips a rule whose spell differs from the trigger's spell", () => {
    const binding = rule("q", { conditions: [spell("q.c", "LuxLightBinding")] });
    const finale = rule("r", { conditions: [spell("r.c", "LuxR")] });

    const played = simulateTrigger(
      situation([binding, finale]),
      { ...ANY, spell: "LuxR" },
      sequence(0),
    );

    expect(played?.path).toBe("r");
  });

  it("keeps the rule of the trigger's target champion", () => {
    const ezreal = rule("e", { conditions: [otherIs("e.c", "Ezreal")] });
    const quinn = rule("q", { conditions: [otherIs("q.c", "Quinn")] });

    const played = simulateTrigger(
      situation([ezreal, quinn]),
      { ...ANY, target: "Quinn" },
      sequence(0),
    );

    expect(played?.path).toBe("q");
  });

  it("draws among valid rules by weight and never draws a zero weight beside others", () => {
    const light = rule("a", { chanceWeight: 1 });
    const heavy = rule("b", { chanceWeight: 3 });
    const never = rule("c", { chanceWeight: 0 });
    const random = situation([never, light, heavy], true);

    expect(simulateTrigger(random, ANY, sequence(0.1))?.path).toBe("a");
    expect(simulateTrigger(random, ANY, sequence(0.9))?.path).toBe("b");
  });

  it("returns null if no rule names a line for the audience", () => {
    const played = simulateTrigger(
      situation([rule("a")]),
      { ...ANY, audience: "enemy" },
      sequence(0),
    );

    expect(played).toBeNull();
  });
});

describe("chanceEdits", () => {
  it("sets the percent of each picked chance as one list of edits, clamped to 100", () => {
    const chances = [
      rule("a", { conditions: [chance("{1}.a[0]", 30)] }),
      rule("b", { conditions: [chance("{1}.b[0]", 50)] }),
    ]
      .map(ruleChance)
      .filter((each) => each !== null);

    const edits = chanceEdits(chances, 140);

    expect(edits).toHaveLength(4);
    expect(edits[1]).toEqual({
      type: "setLeaf",
      path: "{1}.a[0].3f2d5dae",
      value: { type: "integer", text: "100" },
    });
  });
});

describe("conditionText", () => {
  it("reads a spell, a target champion and a chance in words", () => {
    expect(conditionText(spell("a", "LuxLightBinding"))).toBe("spell LuxLightBinding");
    expect(conditionText(otherIs("b", "Ezreal"))).toBe("other is Ezreal");
    expect(conditionText(chance("c", 50))).toBe("50 %");
  });

  it("reads an unknown class as its short name and fields", () => {
    const unknown = condition("ContextualConditionGameTimer", "d", [
      field("mGameTimeInMinutes", { kind: "float", value: 20 }),
    ]);

    expect(conditionText(unknown)).toBe("GameTimer(mGameTimeInMinutes = 20)");
  });
});

function context(situationKey: number, ruleName: string | null, object: string): EventContext {
  return {
    situation: "AttackChampion2D",
    situationKey,
    rule: ruleName,
    chance: 50,
    audience: "owner",
    ambiguous: false,
    row: {
      asset: null,
      bin: "cac.bin",
      objectHash: object,
      object,
      classHash: "0xcf313c24",
      class: "ContextualActionData",
      property: { path: `p:${ruleName}`, label: "" },
    },
  };
}

describe("playedBy", () => {
  it("collapses audiences and copies of a rule into one rule with its chance", () => {
    const contexts = [
      context(1, "Champion", "0x1"),
      { ...context(1, "Champion", "0x1"), audience: "enemy" as const },
      context(1, "Champion", "0x2"),
    ];

    const played = playedBy(contexts, false);

    expect(played).toMatchObject({ kind: "rules", word: "Attack order", count: 1, chance: 50 });
  });

  it("counts distinct rules and drops the chance for several", () => {
    const played = playedBy([context(1, "Champion", "0x1"), context(2, "Minion", "0x1")], false);

    expect(played).toMatchObject({ kind: "rules", count: 2, chance: null });
  });

  it("says listed only for an event that only a bank unit lists", () => {
    expect(playedBy([], true)).toEqual({ kind: "listed" });
    expect(playedBy([], false)).toEqual({ kind: "nothing" });
  });
});

describe("copyObjectName", () => {
  it("names the copy after the skin number of the bin", () => {
    expect(
      copyObjectName("Characters/Lux/CAC/Lux_Base", "data/characters/lux/skins/skin7.bin"),
    ).toBe("Characters/Lux/CAC/Lux_Skin07");
    expect(
      copyObjectName("Characters/Lux/CAC/Lux_Skin17", "data/characters/lux/skins/skin23.bin"),
    ).toBe("Characters/Lux/CAC/Lux_Skin23");
  });

  it("returns null for a bin that is not a skin bin", () => {
    expect(copyObjectName("Characters/Lux/CAC/Lux_Base", "data/characters/lux/lux.bin")).toBeNull();
  });
});

describe("voiceLineRows", () => {
  const lines: VoiceLines = {
    cooldown: 15,
    healthThreshold: null,
    situations: [
      situation([
        rule("{00000007}.r[0]"),
        rule("{00000007}.r[1]", {
          audio: {
            class: 0,
            maxOccurrences: 0,
            waitForAnnouncer: false,
            waitTimeout: 0,
            lines: [line("Quinn3D")],
          },
        }),
      ]),
    ],
  };

  it("lists a header, its rules and its add row while the situation is open", () => {
    const rows = voiceLineRows(lines, new Set(), { text: "", unresolved: false }, true);

    expect(rows.map((row) => row.kind)).toEqual(["situation", "rule", "rule", "add"]);
  });

  it("keeps only the unresolved rules under the unresolved filter, without the add row", () => {
    const rows = voiceLineRows(lines, new Set(), { text: "", unresolved: true }, true);

    expect(rows.map((row) => row.key)).toEqual(["s:{00000007}", "r:{00000007}.r[1]"]);
  });

  it("draws a folded situation as its header alone", () => {
    const rows = voiceLineRows(
      lines,
      new Set(["s:{00000007}"]),
      { text: "", unresolved: false },
      true,
    );

    expect(rows).toHaveLength(1);
  });
});

describe("topicEdits", () => {
  it("gives the cooldown modifications pointer a class before it sets a timer flag", () => {
    const edits = topicEdits("{1}.r[0]", "ignoreTimer", true);

    expect(edits[0]).toEqual({
      type: "ensurePointer",
      path: "{1}.r[0].98b66135",
      class: "ContextualActionCooldownModifications",
    });
    expect(edits.at(-1)).toEqual({
      type: "setLeaf",
      path: "{1}.r[0].98b66135.59c20478",
      value: { type: "bool", value: true },
    });
  });

  it("clears the priority option with a null value", () => {
    expect(topicEdits("{1}.r[0]", "priority", null)).toEqual([
      { type: "removeItem", path: "{1}.r[0].0f717330[0]" },
    ]);
  });

  it("sets the rule name where the rule writes it, without adding a field", () => {
    expect(topicEdits("{1}.r[0]", "name", "Q")).toHaveLength(1);
  });
});

describe("objectPath", () => {
  it("writes a path under mSituations from the object's root", () => {
    expect(objectPath("{5ca57000}.1a116faf[0]")).toBe("6f5eb901{5ca57000}.1a116faf[0]");
  });
});

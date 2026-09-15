import type { EffectSystem, SpellPreview } from "@/lib/tauri";

import { nameHash } from "../../shared/utils/binHash";

export function castTiming(spell: SpellPreview): {
  release: number;
  timingConflict?: [number, number];
} {
  const a = spell.spellCastTime;
  const b = spell.castTime;
  if (a != null && b != null && Math.abs(a - b) > 0.00001)
    return { release: a, timingConflict: [a, b] };
  return { release: a ?? b ?? 0 };
}

const positive = (value: number | null | undefined) =>
  value != null && Number.isFinite(value) && value > 0 && value <= 100000 ? value : 0;

export function spellGuides(spell: SpellPreview) {
  return {
    range:
      positive(spell.castRangeDisplay?.[1]) ||
      positive(spell.castRangeValues?.[1]) ||
      positive(spell.castRange?.[1]),
    radius: positive(spell.castRadius?.[1]),
    secondaryRadius: positive(spell.castRadiusSecondary?.[1]),
    coneAngle:
      spell.castConeAngle != null && spell.castConeAngle <= 360 ? positive(spell.castConeAngle) : 0,
    coneDistance: positive(spell.castConeDistance),
  };
}

/** A unique skin resolver entry, with exact names as a fallback for missing keys. */
export function spellEffect(
  effects: readonly EffectSystem[],
  key: string | null | undefined,
  name: string | null | undefined,
  names: Readonly<Record<string, { path: string }>> = {},
): EffectSystem | null {
  const keyed = effects.filter((effect) => effect.key === key);
  if (keyed.length > 0) return keyed.length === 1 ? keyed[0] : null;
  if (!name?.trim()) return null;
  const normalized = name.toLowerCase();
  const hash = nameHash(name);
  const candidates = effects.filter((effect) => {
    const path = names[effect.system]?.path.toLowerCase();
    return effect.key === hash || path === normalized || path?.split("/").at(-1) === normalized;
  });
  const match = candidates.length === 1 ? candidates[0] : null;
  return match !== null && effects.filter((effect) => effect.key === match.key).length === 1
    ? match
    : null;
}

const HIT_FIELDS = ["mSpell.bHaveHitEffect", "mSpell.mHitEffectKey", "mSpell.mHitEffectName"];

export function spellImpact(
  spell: SpellPreview,
  effects: readonly EffectSystem[],
  names?: Readonly<Record<string, { path: string }>>,
): EffectSystem | null {
  if (
    spell.haveHitEffect === false ||
    spell.issues.some((issue) => issue.kind === "invalid" && HIT_FIELDS.includes(issue.path))
  )
    return null;
  return spellEffect(effects, spell.hitEffectKey, spell.hitEffectName, names);
}

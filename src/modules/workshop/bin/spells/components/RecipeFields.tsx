import { useQuery } from "@tanstack/react-query";

import { Button, Field, Select } from "@/components";
import { m } from "@/i18n";
import type { BinDocumentId, SkinModel } from "@/lib/tauri";
import { viewportQueries } from "@/modules/viewport";

import { skinQueries } from "../../skin/api/skinQueries";
import type { GraphSource } from "../../skin/hooks/useGraphSource";
import { spellQueries } from "../api/spellQueries";
import { abilityRecipeSchema, arrivalOf, type AbilityRecipe } from "../utils/abilityRecipe";

const GUIDE_LABELS = {
  range: m.workshop_ability_range_label,
  radius: m.workshop_ability_radius_label,
  secondaryRadius: m.workshop_ability_secondary_radius_label,
  coneAngle: m.workshop_ability_cone_angle_label,
  coneDistance: m.workshop_ability_cone_distance_label,
};
const GUIDE_KEYS = Object.keys(GUIDE_LABELS) as (keyof typeof GUIDE_LABELS)[];
const CAST_FIELDS = ["spellCastTime", "mCastTime"] as const;

export function RecipeFields({
  document,
  skin,
  graph: source,
  recipe,
  onChange,
}: {
  document: BinDocumentId;
  skin: SkinModel;
  graph: GraphSource;
  recipe: AbilityRecipe;
  onChange: (recipe: AbilityRecipe) => void;
}) {
  const graph = useQuery(skinQueries.graph(source.document, source.graph));
  const skeleton = useQuery(viewportQueries.skeleton(skin.skeleton?.asset ?? null));
  const names = useQuery(
    spellQueries.effects(
      document,
      skin.effectSystems.map((effect) => effect.system),
    ),
  );
  const effects = skin.effectSystems
    .filter((effect) => skin.effectSystems.filter((other) => other.key === effect.key).length === 1)
    .map((effect) => ({
      value: effect.key,
      label: names.data?.objects[effect.system]?.path.split("/").at(-1) ?? effect.system,
    }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.value.localeCompare(b.value));
  const clips =
    graph.data?.clips
      .filter((clip) => clip.animation?.asset != null)
      .map((clip) => ({ value: clip.hash, label: clip.name })) ?? [];
  const change = (patch: Partial<AbilityRecipe>) => onChange({ ...recipe, ...patch });
  return (
    <div className="flex flex-col gap-4">
      <p className="text-meta leading-relaxed text-surface-400">
        {m.workshop_ability_authored_hint()}
      </p>
      <label className="flex flex-col gap-1 text-meta text-surface-300">
        {m.workshop_ability_name_label()}
        <Field.Control
          value={recipe.name}
          onChange={(event) => change({ name: event.target.value })}
        />
      </label>
      <Choice
        label={m.workshop_ability_animation_label()}
        value={recipe.clip ?? ""}
        items={[{ value: "", label: m.workshop_ability_bind_pose_label() }, ...clips]}
        onChange={(clip) => change({ clip: clip || null })}
      />
      <Choice
        label={m.workshop_ability_bone_label()}
        value={recipe.bone}
        items={[
          { value: "", label: m.workshop_ability_origin_label() },
          ...(skeleton.data?.joints.map((joint) => ({ value: joint.name, label: joint.name })) ??
            []),
        ]}
        onChange={(bone) => change({ bone })}
      />
      <section className="flex flex-col gap-2">
        <h3 className="border-b border-surface-700/50 pb-1 text-meta font-medium text-surface-200">
          {m.workshop_ability_cast_label()}
        </h3>
        <Choice
          label={m.workshop_ability_cast_effect_label()}
          value={recipe.castEffect ?? ""}
          items={[{ value: "", label: m.workshop_ability_none_label() }, ...effects]}
          onChange={(value) => change({ castEffect: value || null })}
        />
        <Seconds
          label={m.workshop_ability_release_label()}
          value={recipe.release}
          onChange={(release) => change({ release, timingConflict: undefined })}
        />
        {recipe.timingConflict !== undefined && (
          <div className="flex flex-col gap-2">
            <p className="text-meta text-warning-text">
              {m.workshop_ability_timing_conflict_hint()}
            </p>
            <div className="flex flex-wrap gap-2">
              {recipe.timingConflict.map((release, index) => (
                <Button
                  key={index}
                  size="xs"
                  variant="ghost"
                  onClick={() => change({ release, timingConflict: undefined })}
                >
                  {m.workshop_ability_cast_time_action({
                    field: CAST_FIELDS[index],
                    time: release.toFixed(3),
                  })}
                </Button>
              ))}
            </div>
          </div>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="border-b border-surface-700/50 pb-1 text-meta font-medium text-surface-200">
          {m.workshop_ability_flight_label()}
        </h3>
        <Choice
          label={m.workshop_ability_projectile_label()}
          value={recipe.projectileEffect ?? ""}
          items={[{ value: "", label: m.workshop_ability_none_label() }, ...effects]}
          onChange={(value) => change({ projectileEffect: value || null })}
        />
        {recipe.projectileEffect !== null && (
          <>
            <Seconds
              label={m.workshop_ability_delay_label()}
              value={recipe.missileDelay ?? 0}
              onChange={(missileDelay) => change({ missileDelay })}
            />
            <Seconds
              label={m.workshop_ability_flight_time_label()}
              value={recipe.flightDuration}
              onChange={(flightDuration) => change({ flightDuration })}
            />
          </>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="border-b border-surface-700/50 pb-1 text-meta font-medium text-surface-200">
          {m.workshop_ability_impact_label({ time: arrivalOf(recipe).toFixed(2) })}
        </h3>
        <Choice
          label={m.workshop_ability_impact_effect_label()}
          value={recipe.impactEffect ?? ""}
          items={[{ value: "", label: m.workshop_ability_none_label() }, ...effects]}
          onChange={(value) => change({ impactEffect: value || null })}
        />
        {recipe.impactEffect !== null && (
          <Seconds
            label={m.workshop_ability_impact_time_label()}
            value={recipe.impactDuration}
            onChange={(impactDuration) => change({ impactDuration })}
          />
        )}
        <div className="grid grid-cols-3 gap-2">
          {[
            m.workshop_ability_target_x_label(),
            m.workshop_ability_target_y_label(),
            m.workshop_ability_target_z_label(),
          ].map((label, index) => (
            <label key={label} className="flex min-w-0 flex-col gap-1 text-meta text-surface-300">
              {label}
              <Field.Control
                type="number"
                value={Number.isFinite(recipe.target[index]) ? recipe.target[index] : ""}
                onChange={(event) => {
                  const target = [...recipe.target] as AbilityRecipe["target"];
                  target[index] = event.target.valueAsNumber;
                  change({ target });
                }}
              />
            </label>
          ))}
        </div>
      </section>
      {recipe.guides !== undefined && (
        <details className="text-meta text-surface-300">
          <summary className="cursor-pointer">{m.workshop_ability_guides_label()}</summary>
          <div className="flex flex-col gap-2 pt-2">
            <p className="text-surface-400">{m.workshop_ability_guides_hint()}</p>
            {GUIDE_KEYS.map((key) => (
              <label key={key} className="flex items-center justify-between gap-3">
                {GUIDE_LABELS[key]()}
                <Field.Control
                  className="w-24"
                  type="number"
                  min={0}
                  max={key === "coneAngle" ? 360 : 100000}
                  value={Number.isFinite(recipe.guides![key]) ? recipe.guides![key] : ""}
                  onChange={(event) =>
                    change({ guides: { ...recipe.guides!, [key]: event.target.valueAsNumber } })
                  }
                />
              </label>
            ))}
          </div>
        </details>
      )}
      {!abilityRecipeSchema.safeParse(recipe).success && (
        <p className="text-meta text-warning-text">{m.workshop_ability_invalid_hint()}</p>
      )}
      {(graph.isError || skeleton.isError) && (
        <p className="text-meta text-danger-text">{m.workshop_bin_preview_failed_empty()}</p>
      )}
    </div>
  );
}

function Choice({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: string;
  items: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 text-meta text-surface-300">
      <span>{label}</span>
      <Select.Root
        items={items}
        value={value}
        onValueChange={(next) => {
          if (next !== null) onChange(next);
        }}
      >
        <Select.Trigger aria-label={label} className="h-8 min-w-0 gap-2 px-2 text-meta">
          <Select.Value className="min-w-0 truncate" placeholder={label}>
            {items.find((item) => item.value === value)?.label ?? value}
          </Select.Value>
          <Select.Icon />
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner>
            <Select.Popup>
              {items.map((item) => (
                <Select.Item key={item.value} value={item.value} className="text-meta">
                  {item.label}
                </Select.Item>
              ))}
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}

function Seconds({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-meta text-surface-300">
      {label}
      <Field.Control
        type="number"
        min={0}
        max={30}
        step={0.05}
        className="w-24"
        value={Number.isFinite(value) ? value : ""}
        onChange={(event) => onChange(event.target.valueAsNumber)}
      />
    </label>
  );
}

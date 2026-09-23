import type { Dispatch, SetStateAction } from "react";

import { Accordion, Code, Field } from "@/components";
import { m } from "@/i18n";
import type { EffectSystem, SpellPreview } from "@/lib/tauri";

export function MissileOptions({
  preview,
  anchors,
  setAnchors,
  effect,
}: {
  preview: SpellPreview;
  anchors: number[];
  setAnchors: Dispatch<SetStateAction<number[]>>;
  effect: EffectSystem | undefined;
}) {
  const labels = [
    m.workshop_missile_from_x_label(),
    m.workshop_missile_from_z_label(),
    m.workshop_missile_to_x_label(),
    m.workshop_missile_to_z_label(),
    m.workshop_missile_height_label(),
  ];
  const movement = preview.missile?.movement;
  const motion = movement?.kind === "unsupported" ? movement.class_hash : movement?.kind;
  return (
    <Accordion.Root className="shrink-0 rounded-none border-t border-surface-700/40">
      {preview.missile !== null && (
        <Accordion.Item value="placement">
          <Accordion.Trigger className="text-meta text-surface-300">
            {m.workshop_missile_placement_label()}
          </Accordion.Trigger>
          <Accordion.Panel>
            <div className="flex flex-col gap-3 px-3 pb-3">
              <p className="text-meta leading-relaxed text-surface-400">
                {m.workshop_missile_manual_hint()}
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {labels.map((label, index) => (
                  <label
                    key={label}
                    className="flex min-w-0 items-center justify-between gap-2 text-meta text-surface-300"
                  >
                    <span>{label}</span>
                    <Field.Control
                      type="number"
                      className="h-7 w-20 shrink-0 px-2 text-meta"
                      value={Number.isFinite(anchors[index]) ? anchors[index] : ""}
                      onChange={(event) => {
                        const value = event.target.value === "" ? NaN : Number(event.target.value);
                        setAnchors((held) => held.map((old, at) => (at === index ? value : old)));
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
          </Accordion.Panel>
        </Accordion.Item>
      )}
      <Accordion.Item value="details">
        <Accordion.Trigger className="text-meta text-surface-300">
          {m.workshop_missile_details_label()}
        </Accordion.Trigger>
        <Accordion.Panel>
          <div className="flex flex-col gap-3 px-3 pb-3 text-meta text-surface-400 select-text">
            <p className="leading-relaxed">{m.workshop_missile_manual_hint()}</p>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2">
              <dt>{m.workshop_missile_movement_label()}</dt>
              <dd>
                <Code>{motion ?? "—"}</Code>
              </dd>
              <dt>{m.workshop_missile_bones_label()}</dt>
              <dd>
                <Code>{`${preview.missile?.startBone ?? "—"} → ${preview.missile?.targetBone ?? "—"}`}</Code>
              </dd>
              <dt>{m.workshop_missile_key_label()}</dt>
              <dd>
                <Code>{preview.effectKey ?? "—"}</Code>
              </dd>
              <dt>{m.workshop_missile_system_label()}</dt>
              <dd>
                <Code>{effect?.system ?? "—"}</Code>
              </dd>
            </dl>
            {preview.issues.length > 0 && (
              <div className="flex flex-col gap-2">
                <p>{m.workshop_missile_skipped_label()}</p>
                <ul className="flex flex-col gap-1 break-all">
                  {preview.issues.map((issue) => (
                    <li key={issue.path}>
                      <Code>{issue.path}</Code>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion.Root>
  );
}

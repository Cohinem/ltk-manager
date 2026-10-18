import { type ReactNode, useMemo, useState } from "react";

import { NumberField } from "@/components";
import { m } from "@/i18n";

import { type TransformParts, transformOf, transformParts } from "../utils/placeableSpace";

const AXES = ["X", "Y", "Z"] as const;
const ROWS: readonly {
  part: keyof TransformParts;
  label: () => string;
  step: number;
}[] = [
  {
    part: "position",
    label: m.workshop_bin_map_transform_position_label,
    step: 1,
  },
  {
    part: "rotation",
    label: m.workshop_bin_map_transform_rotation_label,
    step: 1,
  },
  {
    part: "scale",
    label: m.workshop_bin_map_transform_scale_label,
    step: 0.01,
  },
];

const FORMAT: Intl.NumberFormatOptions = { maximumFractionDigits: 3 };

export interface TransformFieldsProps {
  /** Column major in the engine's space. */
  readonly transform: readonly (number | null)[];
  readonly disabled?: boolean;
  /** Takes the transform a typed value makes, column major. */
  readonly onCommit: (transform: number[]) => void;
}

/**
 * The position, rotation in degrees and scale of a transform, each axis a field that scrubs
 * sideways and takes a typed value, which applies on Enter or when the field lets go. Per
 * "Transform space" in docs/ux/MAP_EDITOR.md.
 */
export function TransformFields({ transform, disabled, onCommit }: TransformFieldsProps) {
  const parts = useMemo(() => transformParts(transform), [transform]);
  /* A draft per field while it is typed or scrubbed, dropped once the transform reads back. */
  const [draft, setDraft] = useState<{
    source: TransformParts;
    parts: TransformParts;
  } | null>(null);
  const shown = draft?.source === parts ? draft.parts : parts;

  const edited = (part: keyof TransformParts, axis: number, value: number): TransformParts => {
    const next = [...shown[part]] as [number, number, number];
    next[axis] = value;
    return { ...shown, [part]: next };
  };

  return (
    <div className="grid grid-cols-[auto_1fr_1fr_1fr] items-center gap-x-1 gap-y-0.5">
      {ROWS.map(({ part, label, step }) => (
        <TransformRow key={part} label={label()}>
          {AXES.map((axis, at) => (
            <NumberField
              key={axis}
              value={shown[part][at] ?? 0}
              step={step}
              format={FORMAT}
              disabled={disabled}
              scrub={axis}
              aria-label={`${label()} ${axis}`}
              onValueChange={(value) => {
                if (value !== null) setDraft({ source: parts, parts: edited(part, at, value) });
              }}
              onValueCommitted={(value) => {
                if (value === null || value === parts[part][at]) return;
                onCommit(transformOf(edited(part, at, value)));
              }}
            />
          ))}
        </TransformRow>
      ))}
    </div>
  );
}

function TransformRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="pr-1 text-meta text-surface-400">{label}</span>
      {children}
    </>
  );
}

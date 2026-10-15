import type { ReactNode } from "react";

import { Inline, NumberField, Select, Switch } from "@/components";

import type { Point } from "../../engine/model/rig";

/** A labelled row with its control at the end. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Inline gap={2} justify="between">
      <span className="min-w-0 truncate text-xs text-surface-300">{label}</span>
      {children}
    </Inline>
  );
}

/** A labelled number field. */
export function NumberRow({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (next: number) => void;
}) {
  return (
    <Row label={label}>
      <NumberField
        aria-label={label}
        className="w-20 text-right"
        value={value}
        step={step}
        onValueChange={(next) => {
          if (next !== null && Number.isFinite(next)) onChange(next);
        }}
      />
    </Row>
  );
}

const AXES = [0, 1, 2] as const;

/** A labelled point of three number fields. */
export function PointRow({
  label,
  value,
  step = 0.1,
  onChange,
}: {
  label: string;
  value: Point;
  step?: number;
  onChange: (next: Point) => void;
}) {
  return (
    <Row label={label}>
      <Inline gap={1}>
        {AXES.map((axis) => (
          <NumberField
            key={axis}
            aria-label={`${label} ${"XYZ"[axis]}`}
            className="w-12 text-right"
            value={value[axis]}
            step={step}
            onValueChange={(next) => {
              if (next === null || !Number.isFinite(next)) return;
              const point: [number, number, number] = [value[0], value[1], value[2]];
              point[axis] = next;
              onChange(point);
            }}
          />
        ))}
      </Inline>
    </Row>
  );
}

/** A labelled switch. */
export function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Row label={label}>
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </Row>
  );
}

/** A labelled menu of `options`, each a value and its label. */
export function ChoiceRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (next: T) => void;
}) {
  return (
    <Row label={label}>
      <Select.Root
        value={value}
        onValueChange={(next) => {
          if (next !== null) onChange(next as T);
        }}
      >
        <Select.Trigger aria-label={label} size="sm" className="w-36">
          <Select.Value>
            {(current) => options.find(([option]) => option === current)?.[1] ?? ""}
          </Select.Value>
          <Select.Icon />
        </Select.Trigger>
        <Select.Content>
          {options.map(([option, text]) => (
            <Select.Item key={option} value={option}>
              {text}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </Row>
  );
}

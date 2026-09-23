import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { Button, ColorPicker, NumberField, Popover } from "@/components";
import { m } from "@/i18n";
import type { SchemaParam } from "@/lib/tauri";
import type { HeldValue } from "@/modules/viewport";
import { twMerge } from "@/utils";

import { Swatch } from "../../values/components/ColorMark";
import { useHeldValueStore } from "../state/heldValue";
import { componentCount, paramDefault } from "../utils/declaredRows";

const AXES = ["X", "Y", "Z", "W"] as const;
const CHANNELS = ["R", "G", "B", "A"] as const;

/** What one scrubbed pixel moves a component by. */
const STEP = 0.01;
const FORMAT: Intl.NumberFormatOptions = { maximumFractionDigits: 3 };

/* DS-HOVER. A value the material writes is a field, and the shader's default the same field
   with its surface taken away. */
const WRITTEN_FIELD =
  "border-surface-700 bg-surface-800 text-surface-200 enabled:hover:border-accent-hover";
const DEFAULT_FIELD =
  "border-dashed border-surface-700 bg-transparent text-surface-500 enabled:hover:border-accent-hover enabled:hover:bg-transparent enabled:hover:text-surface-300";

/** The program reads a committed value reaches, which the preview draws once they answer. */
const PROGRAM_READS: ReadonlySet<unknown> = new Set(["material-program", "skin-programs"]);

/** A parameter the colour control reads as a colour, by the rule of the material plan. */
function isColor(param: SchemaParam): boolean {
  return /(color|tint)$/i.test(param.name) && componentCount(param.fields) >= 3;
}

export interface LiveParamProps {
  param: SchemaParam;
  /** The `StaticMaterialDef` the value is drawn on. */
  material: string;
  /** The components the material writes, or null where the shader's default draws. */
  stored: readonly number[] | null;
  /** Write the released value into the bin, answering whether it landed. */
  write: (values: number[]) => Promise<boolean>;
}

/**
 * One parameter's components as fields that scrub, drawn live while held and written on
 * release. A colour carries a swatch that opens a picker beside the fields. A parameter the
 * material leaves to the shader draws its default in muted fields, and editing one writes the
 * material's own value.
 *
 * "Live values" in docs/ux/BIN_EDITOR.md. The held value is let go once the program reads
 * the commit invalidated have answered, so the preview never draws the old value between.
 */
export function LiveParam({ param, material, stored, write }: LiveParamProps) {
  const client = useQueryClient();
  const hold = useHeldValueStore((state) => state.hold);
  const release = useHeldValueStore((state) => state.release);
  const [draft, setDraft] = useState<number[] | null>(null);
  /* The commit fires in the same event as the last scrub step, before a render hands it the draft. */
  const latest = useRef<number[] | null>(null);

  const inherited = stored === null && draft === null;
  const shown = draft ?? stored ?? paramDefault(param);
  const count = Math.min(shown.length, Math.max(1, componentCount(param.fields)));
  const color = isColor(param);
  const labels = color ? CHANNELS : AXES;

  const heldOf = (values: readonly number[]): HeldValue => ({
    material,
    physical: param.physical,
    fields: param.fields,
    value: values,
  });

  const change = (values: number[]) => {
    latest.current = values;
    setDraft(values);
    hold(heldOf(values));
  };

  const commit = async () => {
    const values = latest.current;
    if (values === null) return;
    latest.current = null;
    await write(values);
    await client.invalidateQueries(
      { predicate: (query) => PROGRAM_READS.has(query.queryKey[0]) },
      { cancelRefetch: false },
    );
    release(heldOf(values));
    setDraft(null);
  };

  const componentAt = (at: number, next: number | null) => {
    if (next === null) return;
    const base = latest.current ?? [...shown];
    change(base.map((value, index) => (index === at ? next : value)));
  };

  return (
    /* The number field commits on blur and on a scrub's release, and Enter commits here as
       every other field of the inspector does. */
    <span
      className="flex min-w-0 items-center gap-1"
      title={inherited ? m.workshop_bin_material_shader_default_label() : undefined}
      onKeyDown={(event) => {
        if (event.key === "Enter") void commit();
      }}
    >
      {color && (
        <ColorSwatch
          label={param.name}
          values={shown}
          muted={inherited}
          onChange={(rgb) =>
            change((latest.current ?? [...shown]).map((value, index) => rgb[index] ?? value))
          }
          onClose={() => void commit()}
        />
      )}
      {shown.slice(0, count).map((value, at) => (
        <NumberField
          key={labels[at]}
          value={value}
          step={STEP}
          format={FORMAT}
          scrub={labels[at]}
          aria-label={m.workshop_bin_material_component_label({
            name: param.name,
            component: labels[at],
          })}
          className={twMerge("w-14", inherited ? DEFAULT_FIELD : WRITTEN_FIELD)}
          onValueChange={(next) => componentAt(at, next)}
          onValueCommitted={() => void commit()}
        />
      ))}
    </span>
  );
}

/** The colour's swatch, which opens a picker held live until it closes. */
function ColorSwatch({
  label,
  values,
  muted,
  onChange,
  onClose,
}: {
  label: string;
  values: readonly number[];
  muted: boolean;
  onChange: (rgb: readonly [number, number, number]) => void;
  onClose: () => void;
}) {
  const rgb: readonly [number, number, number] = [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];

  return (
    <Popover.Root onOpenChange={(open) => !open && onClose()}>
      <Popover.Trigger
        render={
          <Button
            variant="ghost"
            size="xs"
            compact
            aria-label={label}
            left={
              <Swatch rgba={[...rgb, 1]} className={twMerge("h-4 w-4", muted && "opacity-50")} />
            }
          />
        }
      />
      <Popover.Portal>
        <Popover.Positioner side="left" align="center" sideOffset={12}>
          <Popover.Popup data-ui="LiveParam:picker" aria-label={label} className="w-60 p-3">
            <ColorPicker value={rgb} label={label} onValueChange={onChange} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

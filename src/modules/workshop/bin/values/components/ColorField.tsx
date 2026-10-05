import { useState } from "react";

import {
  Button,
  ChannelSash,
  ColorPicker,
  Popover,
  Slider,
  StepperField,
  Tooltip,
} from "@/components";
import { m } from "@/i18n";
import { colorHex, type RgbColor, twMerge } from "@/utils";

import { Swatch } from "./ColorMark";

/** The channel names a colour's exact fields carry, in `rgba` order. */
const CHANNEL_NAMES = ["R", "G", "B", "A"] as const;

/** What one arrow press moves an exact channel by. */
const CHANNEL_STEP = 0.01;

/** The digits an exact channel draws after the point. */
const CHANNEL_DECIMALS = 3;

/* DS-VEIL, DS-RADIUS */
const TRIGGER =
  "flex h-6 min-w-0 max-w-44 flex-1 items-center gap-1.5 rounded-sm border border-surface-veil bg-surface-veil-soft px-1.5 text-left font-mono text-code text-surface-300";

/**
 * A float colour field as a swatch, its hex and its alpha, which opens a picker to edit it.
 *
 * `values` are three or four channels, each 1 at full. The popover holds the picker, an
 * alpha slider for four channels and each channel as an exact field, which keeps a channel
 * past 1 or below 0 the picker cannot reach. An edit is a draft until Save. Without
 * `onCommit` the field reads only.
 */
export function ColorField({
  values,
  label,
  onCommit,
  className,
}: {
  values: readonly (number | null)[];
  /** Names the colour, for the trigger and the picker. */
  label: string;
  onCommit?: (values: number[]) => void;
  className?: string;
}) {
  const held = values.map((each) => each ?? 0);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(held);
  const shown = open ? draft : held;
  const alpha = shown.length > 3 ? shown[3] : null;
  const rgb: RgbColor = [clamp01(shown[0]), clamp01(shown[1]), clamp01(shown[2])];

  const face = (
    <>
      <Swatch rgba={[...rgb, clamp01(alpha ?? 1)]} className="size-4" />
      <span className="min-w-0 flex-1 truncate">{colorHex(rgb)}</span>
      {alpha !== null && (
        <span className="shrink-0 text-surface-400 tabular-nums">{percent(alpha)}</span>
      )}
    </>
  );

  if (onCommit === undefined) {
    return (
      <span data-ui="ColorField" className={twMerge(TRIGGER, className)}>
        {face}
      </span>
    );
  }

  const change = (at: number, value: number) =>
    setDraft((before) => before.map((each, index) => (index === at ? value : each)));

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(held);
        setOpen(next);
      }}
    >
      <Tooltip content={label}>
        <Popover.Trigger
          aria-label={label}
          data-ui="ColorField"
          className={twMerge(
            TRIGGER,
            "nodrag cursor-pointer transition-colors hover:border-accent-hover",
            className,
          )}
        >
          {face}
        </Popover.Trigger>
      </Tooltip>
      <Popover.Content
        side="bottom"
        align="start"
        sideOffset={6}
        aria-label={label}
        className="nodrag flex w-64 flex-col gap-3 p-3"
      >
        <ColorPicker
          value={rgb}
          label={label}
          onValueChange={(next) => setDraft((before) => [...next, ...before.slice(3)] as number[])}
        />
        {alpha !== null && (
          <Slider
            aria-label={m.workshop_bin_color_alpha_label()}
            min={0}
            max={1}
            step={CHANNEL_STEP}
            value={clamp01(alpha)}
            onValueChange={(value) => change(3, value)}
          />
        )}
        <span className="grid grid-cols-2 gap-1.5">
          {draft.map((value, at) => (
            <span
              key={CHANNEL_NAMES[at] ?? at}
              /* DS-VEIL, DS-RADIUS */
              className="flex min-w-0 items-stretch overflow-hidden rounded-sm border border-surface-veil"
            >
              <ChannelSash channel={at} />
              <StepperField
                className="min-w-0 flex-1 text-meta"
                aria-label={m.workshop_bin_color_channel_label({
                  channel: CHANNEL_NAMES[at] ?? String(at),
                })}
                step={CHANNEL_STEP}
                decimals={CHANNEL_DECIMALS}
                value={value}
                onValueChange={(next) => change(at, next)}
              />
            </span>
          ))}
        </span>
        <span className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            {m.common_cancel_action()}
          </Button>
          <Button
            variant="filled"
            size="sm"
            onClick={() => {
              onCommit(draft);
              setOpen(false);
            }}
          >
            {m.workshop_bin_curve_save_color_action()}
          </Button>
        </span>
      </Popover.Content>
    </Popover.Root>
  );
}

/** Whether a float vector named `name` holds a colour: three or four channels, named for one. */
export function isColorVector(name: string, values: readonly unknown[]): boolean {
  return (values.length === 3 || values.length === 4) && /colou?r$/i.test(name);
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

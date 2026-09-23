import { Slider as BaseSlider } from "@base-ui/react/slider";
import { type KeyboardEvent, type PointerEvent, useState } from "react";

import { m } from "@/i18n";
import {
  colorHex,
  type HsvColor,
  hsvToRgb,
  parseColorHex,
  type RgbColor,
  rgbToHsv,
  twMerge,
} from "@/utils";

import { FieldControl } from "./FormField";

/* The picker draws the colour space itself, which no theme token can replace. */
const HUE_RAMP =
  "linear-gradient(to right, hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))";
const SHADE =
  "linear-gradient(to top, black, transparent), linear-gradient(to right, white, transparent)";

/** How far one arrow press moves the shade knob, and how far with Shift. */
const STEP = 0.01;
const STEP_LARGE = 0.1;

export interface ColorPickerProps {
  readonly value: RgbColor;
  readonly onValueChange: (next: RgbColor) => void;
  /** Names the colour, as the control that opened the picker labels it. */
  readonly label: string;
  readonly className?: string;
}

/**
 * A colour picker: a saturation and brightness square, a hue track and a hex field.
 *
 * The square and the track take a drag or the arrow keys, Shift for a larger step. The hex
 * field takes six digits on Enter or on leaving it, and drops anything else. The hue is
 * kept across a grey, which has no hue of its own, so dragging through one and back out
 * returns to the same hue.
 */
export function ColorPicker({ value, onValueChange, label, className }: ColorPickerProps) {
  const [hsv, setHsv] = useState(() => rgbToHsv(value));
  const [shown, setShown] = useState(value);
  if (colorHex(shown) !== colorHex(value)) {
    setShown(value);
    setHsv(rgbToHsv(value, hsv.hue));
  }

  const change = (next: HsvColor) => {
    const rgb = hsvToRgb(next);
    setHsv(next);
    setShown(rgb);
    onValueChange(rgb);
  };

  return (
    <div data-ui="ColorPicker" className={twMerge("flex flex-col gap-3", className)}>
      <ShadeSquare hsv={hsv} label={label} onChange={change} />
      <HueTrack hsv={hsv} onChange={change} />
      <HexField value={value} label={label} onCommit={(rgb) => change(rgbToHsv(rgb, hsv.hue))} />
    </div>
  );
}

interface ShadeSquareProps {
  readonly hsv: HsvColor;
  readonly label: string;
  readonly onChange: (next: HsvColor) => void;
}

/** Saturation along x and brightness along y, at the current hue. */
function ShadeSquare({ hsv, label, onChange }: ShadeSquareProps) {
  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    onChange({
      ...hsv,
      saturation: unit((event.clientX - box.left) / box.width),
      brightness: 1 - unit((event.clientY - box.top) / box.height),
    });
  };

  const nudge = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? STEP_LARGE : STEP;
    const move: Record<string, Partial<HsvColor>> = {
      ArrowLeft: { saturation: unit(hsv.saturation - step) },
      ArrowRight: { saturation: unit(hsv.saturation + step) },
      ArrowDown: { brightness: unit(hsv.brightness - step) },
      ArrowUp: { brightness: unit(hsv.brightness + step) },
    };
    const moved = move[event.key];
    if (moved === undefined) return;
    event.preventDefault();
    onChange({ ...hsv, ...moved });
  };

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuetext={m.common_color_picker_shade_label({
        saturation: Math.round(hsv.saturation * 100),
        brightness: Math.round(hsv.brightness * 100),
      })}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        pick(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) pick(event);
      }}
      onKeyDown={nudge}
      /* DS-RADIUS, DS-VEIL */
      className="relative h-36 w-full cursor-crosshair touch-none rounded-md border border-surface-veil-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-300"
      style={{ backgroundColor: `hsl(${hsv.hue} 100% 50%)`, backgroundImage: SHADE }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-brand-on shadow-md"
        style={{
          left: `${hsv.saturation * 100}%`,
          top: `${(1 - hsv.brightness) * 100}%`,
          backgroundColor: `#${colorHex(hsvToRgb(hsv))}`,
        }}
      />
    </div>
  );
}

interface HueTrackProps {
  readonly hsv: HsvColor;
  readonly onChange: (next: HsvColor) => void;
}

/** The hue ramp, on the slider primitive so it keeps its keys and its value for free. */
function HueTrack({ hsv, onChange }: HueTrackProps) {
  return (
    <BaseSlider.Root
      value={hsv.hue}
      min={0}
      max={360}
      step={1}
      onValueChange={(hue) => onChange({ ...hsv, hue: typeof hue === "number" ? hue : hue[0] })}
      className="w-full"
    >
      <BaseSlider.Control className="relative flex h-4 w-full touch-none items-center">
        <BaseSlider.Track
          className="relative h-2.5 w-full rounded-full"
          style={{ backgroundImage: HUE_RAMP }}
        />
        <BaseSlider.Thumb
          aria-label={m.common_color_picker_hue_label()}
          className="absolute top-1/2 h-4 w-2 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-sm border-2 border-brand-on shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-300 data-dragging:cursor-grabbing"
          style={{ backgroundColor: `hsl(${hsv.hue} 100% 50%)` }}
        />
      </BaseSlider.Control>
    </BaseSlider.Root>
  );
}

interface HexFieldProps {
  readonly value: RgbColor;
  readonly label: string;
  readonly onCommit: (next: RgbColor) => void;
}

/** The colour's six hex digits, taken on Enter or on leaving the field. */
function HexField({ value, label, onCommit }: HexFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const parsed = parseColorHex(draft);
    if (parsed !== null) onCommit(parsed);
    setDraft(null);
  };

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-surface-300">{m.common_color_picker_hex_label()}</span>
      <FieldControl
        aria-label={m.common_color_picker_hex_field_label({ label })}
        value={draft ?? colorHex(value)}
        maxLength={7}
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
        className="h-6 w-24 px-2 font-mono text-meta text-code uppercase select-text"
      />
    </div>
  );
}

function unit(fraction: number): number {
  return Math.min(Math.max(fraction, 0), 1);
}

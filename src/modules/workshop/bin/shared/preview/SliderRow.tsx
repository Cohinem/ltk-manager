import { Slider } from "@/components";

/** What a slider spans and the step it moves in. */
export interface SliderRange {
  readonly least: number;
  readonly most: number;
  readonly step: number;
}

export interface SliderRowProps {
  readonly label: string;
  /** The value as text, written beside the label. */
  readonly reading: string;
  readonly value: number;
  readonly range: SliderRange;
  readonly onValueChange: (next: number) => void;
}

/** One parameter of a preview popover: its label, its value as text, and its slider. */
export function SliderRow({ label, reading, value, range, onValueChange }: SliderRowProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-surface-300">{label}</span>
        <span className="font-mono text-meta text-code text-surface-400 tabular-nums">
          {reading}
        </span>
      </div>
      <Slider
        aria-label={label}
        value={value}
        min={range.least}
        max={range.most}
        step={range.step}
        onValueChange={onValueChange}
      />
    </div>
  );
}

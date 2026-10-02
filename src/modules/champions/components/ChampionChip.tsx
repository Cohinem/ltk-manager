import { Chip, type ChipSize } from "@/components";
import { twMerge } from "@/utils";

import { useChampionRoster } from "../api";
import { ChampionPortrait } from "./ChampionPortrait";

const PORTRAIT_CLASSES: Record<ChipSize, string> = {
  sm: "-ml-0.5 size-3",
  md: "-ml-1 size-4",
};

export interface ChampionChipProps {
  /** A value of a mod's or a project's `champions`. */
  readonly value: string;
  readonly size?: ChipSize;
  readonly onRemove?: () => void;
  readonly className?: string;
}

/** A champion pill: its portrait and display name, or the value itself where no champion answers. */
export function ChampionChip({ value, size = "sm", onRemove, className }: ChampionChipProps) {
  const roster = useChampionRoster();
  const label = roster.labelOf(value);

  return (
    <Chip
      tone="champion"
      size={size}
      onRemove={onRemove}
      removeLabel={label}
      className={twMerge(size === "sm" && "gap-1", className)}
    >
      <ChampionPortrait champion={roster.find(value)} className={PORTRAIT_CLASSES[size]} />
      {label}
    </Chip>
  );
}

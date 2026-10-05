import { XIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { focusRing } from "./focus";

/** What a category pill names: a mod's tag, its champion or its map. */
export type CategoryTone = "tag" | "champion" | "map";

/** The fill and label of a category pill. A tag stays neutral, since it names no kind: DS-KIND-HUE. */
export const CATEGORY_TONE: Record<CategoryTone, string> = {
  tag: "bg-surface-700 text-surface-300",
  champion: "bg-cat-champion/15 text-cat-champion-text",
  map: "bg-cat-map/15 text-cat-map-text",
};

/** `sm` is the dense pill of a card, `md` the rounder one of a detail pane or a filter bar. */
export type ChipSize = "sm" | "md";

const SIZE_CLASSES: Record<ChipSize, string> = {
  sm: "gap-0.5 rounded-sm px-1.5 py-0.5 text-fine leading-tight",
  md: "gap-1 rounded-full px-2.5 py-0.5 text-meta",
};

export interface ChipProps {
  readonly tone?: CategoryTone;
  readonly size?: ChipSize;
  /** The chip removes itself from what it filters, which draws a remove button after the label. */
  readonly onRemove?: () => void;
  /** The label the remove button reads, for a chip whose children are not plain text. */
  readonly removeLabel?: string;
  readonly className?: string;
  readonly "aria-label"?: string;
  readonly children: ReactNode;
}

/** A pill naming a category, optionally with a button that removes it. */
export function Chip({
  tone = "tag",
  size = "sm",
  onRemove,
  removeLabel,
  className,
  "aria-label": ariaLabel,
  children,
}: ChipProps) {
  const label = removeLabel ?? (typeof children === "string" ? children : "");

  return (
    <span
      aria-label={ariaLabel}
      className={twMerge(
        "inline-flex items-center",
        SIZE_CLASSES[size],
        CATEGORY_TONE[tone],
        className,
      )}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={m.common_chip_remove_action({ label })}
          /* DS-VEIL */
          className={twMerge(
            "-mr-1 cursor-pointer rounded-full p-0.5 hover:bg-surface-veil",
            focusRing,
          )}
        >
          <XIcon weight="bold" className="size-3" />
        </button>
      )}
    </span>
  );
}

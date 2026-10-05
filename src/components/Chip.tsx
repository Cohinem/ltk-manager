import { XIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { Badge, type BadgeSize, type BadgeTone } from "./Badge";
import { focusRing } from "./focus";

/** What a category pill names: a mod's tag, its champion or its map. */
export type CategoryTone = "tag" | "champion" | "map";

/** A tag stays neutral, since it names no kind: DS-KIND-HUE. */
export const CATEGORY_BADGE_TONE: Record<CategoryTone, BadgeTone> = {
  tag: "neutral",
  champion: "champion",
  map: "map",
};

/** `sm` is the dense pill of a card, `md` the one of a detail pane or a filter bar. */
export type ChipSize = Extract<BadgeSize, "sm" | "md">;

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

/** A `Badge` naming a category, optionally with a button that removes it. */
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
    <Badge
      tone={CATEGORY_BADGE_TONE[tone]}
      size={size}
      aria-label={ariaLabel}
      className={className}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={m.common_chip_remove_action({ label })}
          /* DS-VEIL */
          className={twMerge(
            "-mr-1 cursor-pointer rounded-sm p-0.5 hover:bg-surface-veil",
            focusRing,
          )}
        >
          <XIcon weight="bold" className="size-3" />
        </button>
      )}
    </Badge>
  );
}

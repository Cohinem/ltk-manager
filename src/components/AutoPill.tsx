import { SparkleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { Badge } from "./Badge";
import { CATEGORY_BADGE_TONE, type CategoryTone } from "./Chip";

/** What the pill labels. The hue is the category, so the tone is named for it. */
export type AutoPillTone = CategoryTone;

interface AutoPillProps {
  label: string;
  tone?: AutoPillTone;
  /**
   * Replaces the sparkle, for a pill whose kind is worth a mark of its own.
   *
   * The dashed outline and the tooltip already say auto-detected, so the slot is
   * better spent naming what the pill is than repeating how it was found.
   */
  icon?: ReactNode;
  /** What the pill reads as, for one whose icon carries half the meaning. */
  ariaLabel?: string;
  /** When provided, the pill renders as a button (an actionable suggestion). */
  onClick?: () => void;
  className?: string;
}

/**
 * A dashed `Badge` marking an auto-detected (WAD-footprint-derived) category.
 *
 * Static for display. Pass `onClick` to use it as a clickable suggestion.
 */
export function AutoPill({
  label,
  tone = "tag",
  icon,
  ariaLabel,
  onClick,
  className,
}: AutoPillProps) {
  return (
    <Badge
      dashed
      tone={CATEGORY_BADGE_TONE[tone]}
      icon={icon ?? <SparkleIcon weight="bold" className="size-2.5" />}
      aria-label={ariaLabel}
      onClick={onClick}
      className={className}
    >
      {label}
    </Badge>
  );
}

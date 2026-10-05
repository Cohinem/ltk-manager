import { forwardRef, type HTMLAttributes, type ReactNode, type Ref } from "react";

import { twMerge } from "@/utils";

import { focusRing } from "./focus";
import type { StatusTone } from "./tone";

/**
 * What the badge reports or names.
 *
 * The status tones report a state (DS-TONE). `accent` marks something as the reader's own or
 * current. `champion` and `map` name a kind, from the identity scale: DS-KIND-HUE.
 */
export type BadgeTone = StatusTone | "accent" | "champion" | "map";

/** `sm` sits in a card or a dense row, `md` in a detail pane or a filter bar, and `lg` is 24px. */
export type BadgeSize = "sm" | "md" | "lg";

interface ToneClasses {
  /** The wash and the label: DS-TEXT. */
  fill: string;
  /** The dashed border of an auto-detected badge. */
  dashed: string;
  /** The edge of a badge that is a button. */
  ring: string;
  /** The wash a step up, left off a disabled button. */
  hover: string;
}

const toneClasses: Record<BadgeTone, ToneClasses> = {
  neutral: {
    fill: "bg-surface-700 text-surface-300",
    dashed: "border-surface-400/50",
    ring: "ring-surface-400/30",
    hover: "hover:bg-surface-600",
  },
  accent: {
    fill: "bg-accent-500/15 text-accent-300",
    dashed: "border-accent-400/60",
    ring: "ring-accent-400/30",
    hover: "hover:bg-accent-500/25",
  },
  info: {
    fill: "bg-info/15 text-info-text",
    dashed: "border-info/60",
    ring: "ring-info/30",
    hover: "hover:bg-info/25",
  },
  success: {
    fill: "bg-success/15 text-success-text",
    dashed: "border-success/60",
    ring: "ring-success/30",
    hover: "hover:bg-success/25",
  },
  warning: {
    fill: "bg-warning/15 text-warning-text",
    dashed: "border-warning/60",
    ring: "ring-warning/30",
    hover: "hover:bg-warning/25",
  },
  danger: {
    fill: "bg-danger/15 text-danger-text",
    dashed: "border-danger/60",
    ring: "ring-danger/30",
    hover: "hover:bg-danger/25",
  },
  champion: {
    fill: "bg-cat-champion/15 text-cat-champion-text",
    dashed: "border-cat-champion/60",
    ring: "ring-cat-champion/30",
    hover: "hover:bg-cat-champion/25",
  },
  map: {
    fill: "bg-cat-map/15 text-cat-map-text",
    dashed: "border-cat-map/60",
    ring: "ring-cat-map/30",
    hover: "hover:bg-cat-map/25",
  },
};

/** The fill and label of each tone, for an element that is drawn as a badge without being one. */
export const badgeFill: Record<BadgeTone, string> = {
  neutral: toneClasses.neutral.fill,
  accent: toneClasses.accent.fill,
  info: toneClasses.info.fill,
  success: toneClasses.success.fill,
  warning: toneClasses.warning.fill,
  danger: toneClasses.danger.fill,
  champion: toneClasses.champion.fill,
  map: toneClasses.map.fill,
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: "gap-0.5 px-1.5 py-0.5 text-fine leading-tight",
  md: "gap-1 px-2 py-0.5 text-meta",
  lg: "h-6 gap-1 px-2 text-xs leading-tight font-medium",
};

export interface BadgeProps extends Omit<HTMLAttributes<HTMLElement>, "className" | "children"> {
  /** `neutral` unless told otherwise. */
  tone?: BadgeTone;
  /** `sm` unless told otherwise. */
  size?: BadgeSize;
  /** A dashed edge, which marks what the app worked out and the reader did not set. */
  dashed?: boolean;
  /** A glyph before the label. Size it to the badge: 10px at `sm`, 12px at `md`, 16px at `lg`. */
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * A short label that reports a status or names a kind: DS-RADIUS.
 *
 * It is a `span` at rest. With an `onClick` it is a `button`, and draws an edge in its tone so
 * a badge that can be pressed reads apart from one that cannot. `Chip` adds a remove button to
 * it, and `AutoPill` is the dashed one.
 */
export const Badge = forwardRef<HTMLElement, BadgeProps>(
  (
    {
      tone = "neutral",
      size = "sm",
      dashed = false,
      icon,
      disabled,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const tones = toneClasses[tone];
    const pressable = props.onClick !== undefined;

    const classes = twMerge(
      "inline-flex items-center rounded-sm",
      sizeClasses[size],
      tones.fill,
      dashed && "border border-dashed",
      dashed && tones.dashed,
      pressable && "cursor-pointer transition-colors",
      pressable && !dashed && "ring-1 ring-inset",
      pressable && !dashed && tones.ring,
      pressable && !disabled && tones.hover,
      pressable && focusRing,
      pressable && "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    );

    const content = (
      <>
        {icon}
        {children}
      </>
    );

    if (pressable) {
      return (
        <button
          ref={ref as Ref<HTMLButtonElement>}
          type="button"
          disabled={disabled}
          className={classes}
          {...props}
        >
          {content}
        </button>
      );
    }

    return (
      <span ref={ref as Ref<HTMLSpanElement>} className={classes} {...props}>
        {content}
      </span>
    );
  },
);

Badge.displayName = "Badge";

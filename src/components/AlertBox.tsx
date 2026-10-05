import { XIcon } from "@phosphor-icons/react";
import { type ReactNode } from "react";

import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { IconButton } from "./Button";
import { focusRing } from "./focus";
import { statusGlyph, type StatusTone, statusText } from "./tone";

interface AlertBoxBase {
  /** `info` unless told otherwise. */
  tone?: StatusTone;
  title?: ReactNode;
  children?: ReactNode;
  /** In place of the tone's own glyph. Size it to 20px. */
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
  "data-ui"?: string;
}

/**
 * A pressable box carries no dismiss, since the two would nest one button in another.
 */
export type AlertBoxProps = AlertBoxBase &
  (
    | { onClick?: undefined; disabled?: undefined; onDismiss?: () => void }
    | { onClick: () => void; disabled?: boolean; onDismiss?: never }
  );

/* The status token tinting its own edge and fill. `hover` is the wash a step up, so a
   pressable box answers the pointer in its own hue. */
const toneStyles: Record<StatusTone, { edge: string; fill: string; hover: string }> = {
  neutral: {
    edge: "border-surface-700/60",
    fill: "bg-surface-800/40",
    hover: "hover:bg-surface-800/70",
  },
  info: { edge: "border-info/30", fill: "bg-info/8", hover: "hover:bg-info/12" },
  success: { edge: "border-success/30", fill: "bg-success/8", hover: "hover:bg-success/12" },
  warning: { edge: "border-warning/30", fill: "bg-warning/8", hover: "hover:bg-warning/12" },
  danger: { edge: "border-danger/30", fill: "bg-danger/8", hover: "hover:bg-danger/12" },
};

/** A warning or an error interrupts a screen reader, and the other tones wait their turn. */
const toneRole: Record<StatusTone, "alert" | "status"> = {
  neutral: "status",
  info: "status",
  success: "status",
  warning: "alert",
  danger: "alert",
};

/**
 * A boxed message about the state of what is on screen, in one of the five tones.
 *
 * It takes a `title`, a body as children, or both, and `actions` at its trailing edge.
 * `onDismiss` adds a close button, and `onClick` makes the whole box one button. A box with
 * both a title and a body aligns its glyph to the title's line.
 */
export function AlertBox({
  tone = "info",
  title,
  children,
  icon,
  actions,
  onClick,
  disabled,
  onDismiss,
  className,
  "data-ui": dataUi,
}: AlertBoxProps) {
  const styles = toneStyles[tone];
  const Glyph = statusGlyph[tone];
  const stacked = Boolean(title) && Boolean(children);

  const body = (
    <>
      <div className={twMerge("shrink-0", statusText[tone])}>
        {icon ?? <Glyph weight="duotone" className="size-5" />}
      </div>
      <div className="min-w-0 flex-1">
        {title && <p className="text-sm font-medium text-surface-100">{title}</p>}
        {children && <div className="text-sm text-surface-400">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        data-ui={dataUi}
        disabled={disabled}
        onClick={onClick}
        className={twMerge(
          "flex w-full cursor-pointer items-start gap-2 rounded-lg border px-2 py-2 text-left transition-colors",
          styles.edge,
          styles.fill,
          focusRing,
          "disabled:cursor-not-allowed disabled:opacity-50",
          !disabled && styles.hover,
          className,
        )}
      >
        {body}
      </button>
    );
  }

  return (
    <div
      role={toneRole[tone]}
      data-ui={dataUi}
      className={twMerge(
        "flex gap-2 rounded-lg border px-2 py-2",
        stacked ? "items-start" : "items-center",
        styles.edge,
        styles.fill,
        className,
      )}
    >
      {body}
      {onDismiss && (
        <IconButton
          icon={<XIcon />}
          label={m.common_dismiss_action()}
          muted
          onClick={onDismiss}
          className="shrink-0"
        />
      )}
    </div>
  );
}

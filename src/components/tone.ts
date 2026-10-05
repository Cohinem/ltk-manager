/**
 * The status a component reports: DS-TONE.
 *
 * Every component that shows a status takes this as `tone`, so `danger` is one word across
 * them and never `error` in one and `destructive` in another.
 */
export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

/** The tone's colour for a label or a glyph: DS-TEXT. */
export const statusText: Record<StatusTone, string> = {
  neutral: "text-surface-400",
  info: "text-info-text",
  success: "text-success-text",
  warning: "text-warning-text",
  danger: "text-danger-text",
};

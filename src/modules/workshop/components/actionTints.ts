/*
 * The tints an action group's segments carry, shared by the two rows that draw
 * one: a project's own header, and the workshop's over a selection.
 *
 * Each segment draws its own edge in its own hue, so the group has no neutral
 * rule cutting across a colored fill.
 */

export const testTint =
  "border border-success/30 bg-success/15 text-success-text hover:border-success/45 hover:bg-success/25 active:bg-success/35";

export const packTint =
  "border border-info/30 bg-info/15 text-info-text hover:border-info/45 hover:bg-info/25 active:bg-info/35";

/* A test in progress carries its state in the edge rather than the fill, so it reads apart
   from the idle tint at a glance without the solid fill shouting over the header. */
export const runningTint =
  "border border-success bg-success/25 text-success-text hover:bg-success/35 active:bg-success/45";

/** A segment owning no action of its own, which keeps the neutral edge. */
export const neutralTint = "border border-surface-600";

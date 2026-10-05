import { SpinnerGapIcon } from "@phosphor-icons/react";

import { twMerge } from "@/utils";

/**
 * The spinner's size in pixels.
 *
 * 12, 14 and 16 sit inside a row or a control. 24 and 32 stand in for a view that is loading.
 */
export type SpinnerSize = 12 | 14 | 16 | 24 | 32;

const sizeClasses: Record<SpinnerSize, string> = {
  12: "size-3",
  14: "size-3.5",
  16: "size-4",
  24: "size-6",
  32: "size-8",
};

export interface SpinnerProps {
  /** 24 unless told otherwise. */
  size?: SpinnerSize;
  className?: string;
}

/** A pending mark, muted unless `className` gives it a colour. */
export function Spinner({ size = 24, className }: SpinnerProps) {
  return (
    <SpinnerGapIcon
      weight="bold"
      className={twMerge("animate-spin text-surface-400", sizeClasses[size], className)}
    />
  );
}

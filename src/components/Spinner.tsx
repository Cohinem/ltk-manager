import { SpinnerGapIcon } from "@phosphor-icons/react";

import { twMerge } from "@/utils";

const sizeClasses = {
  xs: "size-3",
  sm: "size-4",
  md: "size-6",
  lg: "size-8",
} as const;

export interface SpinnerProps {
  size?: keyof typeof sizeClasses;
  className?: string;
}

/** A pending mark, muted unless `className` gives it a colour. */
export function Spinner({ size = "md", className }: SpinnerProps) {
  return (
    <SpinnerGapIcon
      weight="bold"
      className={twMerge("animate-spin text-surface-400", sizeClasses[size], className)}
    />
  );
}

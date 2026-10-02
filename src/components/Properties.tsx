import type { ComponentProps, ReactNode } from "react";

import { twMerge } from "@/utils";

/** Facts as label and value pairs, labels in one column and values in the other. */
export function Properties({ className, ...props }: ComponentProps<"dl">) {
  return (
    <dl
      {...props}
      className={twMerge("grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1", className)}
    />
  );
}

export interface PropertyProps {
  readonly label: ReactNode;
  /** Lands on the value. */
  readonly className?: string;
  readonly children: ReactNode;
}

/** One fact of a `Properties` list. */
export function Property({ label, className, children }: PropertyProps) {
  return (
    <>
      <dt className="text-surface-400 select-none">{label}</dt>
      <dd className={twMerge("min-w-0 text-surface-200", className)}>{children}</dd>
    </>
  );
}

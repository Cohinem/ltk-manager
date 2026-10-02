import type { ComponentProps } from "react";

import { twMerge } from "@/utils";

/** The root of a workshop document: a column filling its editor pane, on the page ground. */
export function DocumentFrame({ className, ...props }: ComponentProps<"div">) {
  return (
    <div {...props} className={twMerge("flex min-h-0 flex-1 flex-col bg-surface-950", className)} />
  );
}

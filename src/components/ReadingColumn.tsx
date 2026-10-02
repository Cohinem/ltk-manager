import { type ReactNode } from "react";

import { twMerge } from "@/utils";

import { type Space, Stack } from "./Layout";

const WIDTH = {
  default: "max-w-5xl",
  wide: "max-w-7xl",
} as const;

export interface ReadingColumnProps {
  children: ReactNode;
  width?: keyof typeof WIDTH;
  /** The gap between the sections the column stacks. */
  gap?: Space;
  "data-ui"?: string;
}

/** The centered, padded column a scrolling page stacks its sections in. */
export function ReadingColumn({
  children,
  width = "default",
  gap = 6,
  "data-ui": dataUi,
}: ReadingColumnProps) {
  return (
    <div data-ui={dataUi} className={twMerge("mx-auto w-full p-6", WIDTH[width])}>
      <Stack gap={gap}>{children}</Stack>
    </div>
  );
}

import { type ReactElement, type ReactNode } from "react";

import { twMerge } from "@/utils";

import { Inline, Stack } from "./Layout";

interface SectionCardProps {
  title: string;
  description?: string;
  icon?: ReactElement;
  action?: ReactNode;
  children: ReactNode;
  /** Re-grounds the panel, for a card that sits on something other than the page. */
  panelClassName?: string;
}

/**
 * A titled settings group: the heading sits on the page ground and the panel
 * below it holds only the rows, so a scan down the page reads as a list of
 * labelled groups rather than a stack of identical boxes.
 */
export function SectionCard({
  title,
  description,
  icon,
  action,
  children,
  panelClassName,
}: SectionCardProps) {
  return (
    <Stack as="section" gap={2}>
      <Inline align="start" justify="between" gap={4}>
        <Stack gap={0.5}>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-surface-100">
            {icon && <span className="text-surface-400">{icon}</span>}
            {title}
          </h3>
          {description && <p className="text-xs text-surface-400">{description}</p>}
        </Stack>
        {action}
      </Inline>
      <div
        className={twMerge(
          "flex flex-col gap-4 rounded-xl border border-surface-700/50 bg-surface-900/95 p-5",
          panelClassName,
        )}
      >
        {children}
      </div>
    </Stack>
  );
}

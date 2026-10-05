import { createElement } from "react";

import { AlertBox, ErrorBoundary, type GalleryEntry, OVERLINE, Stack } from "@/components";
import { twMerge } from "@/utils";

import type { Ground } from "../conditions";

const GROUND_CLASS: Record<Ground, string> = {
  "950": "bg-surface-950",
  "900": "bg-surface-900",
  "800": "bg-surface-800",
};

interface EntryCardProps {
  entry: GalleryEntry;
  ground: Ground;
}

/** One component's cases, each under its name, on the chosen ground. */
export function EntryCard({ entry, ground }: EntryCardProps) {
  return (
    <Stack as="section" gap={2} data-ui="Gallery:entry">
      <h3 className="text-sm font-semibold text-surface-100">{entry.name}</h3>
      <div
        className={twMerge(
          "flex flex-col gap-5 rounded-xl border border-surface-700 p-5",
          GROUND_CLASS[ground],
        )}
      >
        {entry.cases.map((item) => (
          <Stack key={item.name} gap={2}>
            <span className={OVERLINE}>{item.name}</span>
            <div className="flex flex-wrap items-center gap-3">
              <ErrorBoundary
                fallback={() => (
                  <AlertBox variant="error" title="This case threw while rendering" />
                )}
              >
                {createElement(item.render)}
              </ErrorBoundary>
            </div>
          </Stack>
        ))}
      </div>
    </Stack>
  );
}

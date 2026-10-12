import { IconButton } from "@/components";
import { twMerge } from "@/utils";

import type { StripPane } from "./PaneStrip";

/** The open tab's tile, in the fill and the edge the open tab takes in `PaneStrip`: DS-GROUND. */
const RAIL_TAB_OPEN = "border border-surface-700/50 bg-surface-900 text-surface-100";

export interface TabRailProps {
  tabs: readonly StripPane[];
  activeId: string | null;
  onActivate: (id: string) => void;
}

/**
 * The tabs of a leaf collapsed in a row, as a column of their icons, per "Collapsing a panel" in
 * `docs/ux/PROJECT_EDITOR.md`.
 *
 * A press activates the tab, and the click reaches the panel, which expands.
 */
export function TabRail({ tabs, activeId, onActivate }: TabRailProps) {
  return (
    <div
      data-ui="TabRail"
      /* DS-GROUND */
      className="flex min-h-0 flex-1 flex-col items-center gap-0.5 overflow-hidden rounded-lg border border-surface-700/50 bg-surface-800 py-1 select-none"
    >
      {tabs.map((tab) => (
        <IconButton
          key={tab.id}
          icon={tab.icon}
          label={tab.title}
          muted={tab.id !== activeId}
          className={twMerge(tab.id === activeId && RAIL_TAB_OPEN)}
          onClick={() => onActivate(tab.id)}
        />
      ))}
    </div>
  );
}

import { CaretDownIcon, XIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { Button, IconButton, Popover, Tooltip } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import type { EditorTab } from "./EditorTabs";

export interface TabOverflowListProps {
  tabs: readonly EditorTab[];
  activeId: string | null;
  /** Tabs the strip's lane does not hold, which the control counts. */
  offscreen: number;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
}

/**
 * Every tab of one group, in strip order, from a control beside the lock.
 *
 * The list belongs to the group it sits in, and a split draws two of them. The
 * control stands only over a strip with a tab out of view. A strip a reader
 * sees whole says what it holds already.
 */
export function TabOverflowList({
  tabs,
  activeId,
  offscreen,
  onActivate,
  onClose,
}: TabOverflowListProps) {
  const [open, setOpen] = useState(false);
  /* An open list stands until it is dismissed. Rows closed from it empty the
     lane under it. */
  if (offscreen === 0 && !open) return null;

  const label = m.editor_tabs_overflow_label({ count: offscreen });

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Tooltip content={label}>
        <Popover.Trigger
          render={
            <Button
              right={<CaretDownIcon weight="bold" className="h-3 w-3" />}
              variant="ghost"
              size="xs"
              compact
              aria-label={label}
              data-ui="TabOverflowList:trigger"
              className="mr-2 h-6 shrink-0 gap-0.5 px-1 text-[0.6875rem] text-surface-300"
            >
              {offscreen}
            </Button>
          }
        />
      </Tooltip>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6}>
          <Popover.Popup
            data-ui="TabOverflowList:popup"
            aria-label={label}
            className="w-72 p-1 select-none"
          >
            <ul className="flex max-h-80 flex-col overflow-y-auto scrollbar-sm">
              {tabs.map((tab) => (
                <TabRow
                  key={tab.id}
                  tab={tab}
                  active={tab.id === activeId}
                  onActivate={(id) => {
                    setOpen(false);
                    onActivate(id);
                  }}
                  onClose={onClose}
                />
              ))}
            </ul>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface TabRowProps {
  tab: EditorTab;
  active: boolean;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
}

function TabRow({ tab, active, onActivate, onClose }: TabRowProps) {
  return (
    <li className="group/row relative flex items-center">
      <button
        type="button"
        onClick={() => onActivate(tab.id)}
        className={twMerge(
          "flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md pr-7 pl-1.5 text-left text-xs",
          "text-surface-300 hover:bg-surface-veil hover:text-surface-100",
          /* DS-GROUND */
          active && "bg-surface-700 text-surface-100",
        )}
      >
        {tab.icon && <span className="flex shrink-0 [&_svg]:h-4 [&_svg]:w-4">{tab.icon}</span>}
        <span className={twMerge("truncate", tab.preview && "italic")}>{tab.title}</span>
        {tab.context && (
          <span className="shrink-[3] truncate text-[0.6875rem] text-surface-400">
            {tab.context}
          </span>
        )}
        {tab.dirty === true && (
          <span
            aria-hidden="true"
            className="ml-auto h-2 w-2 shrink-0 rounded-full bg-current group-hover/row:invisible"
          />
        )}
      </button>

      <IconButton
        icon={<XIcon weight="bold" className="h-3 w-3" />}
        variant="ghost"
        size="xs"
        compact
        onClick={() => onClose(tab.id)}
        aria-label={m.editor_tab_close_label({ title: tab.title })}
        className="absolute top-0 right-1 bottom-0 my-auto h-5 w-5 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
      />
    </li>
  );
}

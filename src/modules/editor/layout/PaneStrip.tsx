import { horizontalListSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowsInSimpleIcon,
  ArrowSquareOutIcon,
  ArrowsOutSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { type CSSProperties, type ReactNode } from "react";

import { ContextMenu, IconButton, Tabs } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { tabDroppableId } from "./dnd";
import { useForeignCaretIndex } from "./useForeignCaretIndex";

/** One item of a strip: what the tab says, and what the tree holds it under. */
export interface StripPane {
  id: string;
  title: string;
  icon?: ReactNode;
}

export interface PaneStripProps {
  /** The leaf this strip belongs to, which scopes its sortable ids across strips. */
  leafId: string;
  panes: readonly StripPane[];
  activeId: string | null;
  onActivate: (id: string) => void;
  /** Absent leaves the strip without close buttons, for a host whose panes are fixed. */
  onClose?: (id: string) => void;
  /** A double click on a tab, which fills the shell with this leaf. */
  onMaximize?: () => void;
  /** This leaf fills the shell, so a tab's menu offers the way back. */
  maximized?: boolean;
  /** Takes a pane out of the strip into a floating frame. Absent leaves no way to float one. */
  onFloat?: (id: string) => void;
  /** Drawn after the tabs, for a control the pane itself owns. */
  actions?: ReactNode;
  /** Whether the actions sit at the strip's right end or take the rest of the strip. */
  actionsWidth?: "end" | "rest";
  className?: string;
}

/**
 * The strip of panes over one leaf: a title per pane, and the grip that moves it.
 *
 * The drag context lives above the whole tree rather than here, so a pane can
 * leave its own strip. Shorter than the document strip, because a pane title is
 * chrome over content the reader came for rather than the thing they chose.
 *
 * A right click on a tab offers what the host passed a handler for: Float, Maximize or
 * Restore, and Close. The open pane's tab also carries Float as a button beside its Close.
 */
export function PaneStrip({
  leafId,
  panes,
  activeId,
  onActivate,
  onClose,
  onMaximize,
  maximized = false,
  onFloat,
  actions,
  actionsWidth = "end",
  className,
}: PaneStripProps) {
  const rest = actionsWidth === "rest";
  const sortableIds = panes.map((pane) => tabDroppableId(leafId, pane.id));
  const caretIndex = useForeignCaretIndex(
    leafId,
    panes.map((pane) => pane.id),
  );

  return (
    <Tabs.Root
      value={activeId}
      onValueChange={(value) => onActivate(String(value))}
      className={twMerge(
        /* DS-GROUND: the strip shares the pane's ground and separates with a hairline. */
        "h-7 shrink-0 flex-row items-center gap-1 border-b border-surface-700/50 px-1 select-none",
        className,
      )}
    >
      <Tabs.List
        variant="plain"
        className={twMerge("h-full min-w-0 flex-1 items-center gap-1", rest && "flex-none")}
      >
        <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
          {panes.map((pane, index) => (
            <SortableStripTab
              key={pane.id}
              leafId={leafId}
              pane={pane}
              active={pane.id === activeId}
              caretBefore={caretIndex === index}
              onClose={onClose}
              onMaximize={onMaximize}
              maximized={maximized}
              onFloat={onFloat}
            />
          ))}
        </SortableContext>
        {caretIndex === panes.length && <DropCaret />}
      </Tabs.List>
      {!rest && actions}
      {rest && <div className="flex h-full min-w-0 flex-1 items-center">{actions}</div>}
    </Tabs.Root>
  );
}

interface SortableStripTabProps {
  leafId: string;
  pane: StripPane;
  active: boolean;
  caretBefore: boolean;
  onClose?: (id: string) => void;
  onMaximize?: () => void;
  maximized: boolean;
  onFloat?: (id: string) => void;
}

function SortableStripTab({
  leafId,
  pane,
  active,
  caretBefore,
  onClose,
  onMaximize,
  maximized,
  onFloat,
}: SortableStripTabProps) {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id: tabDroppableId(leafId, pane.id),
  });

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition: [transition, "background-color 150ms, color 150ms"].filter(Boolean).join(", "),
  };

  const tabProps = {
    ref: setNodeRef,
    style,
    "data-ui": "PaneStrip:tab",
    onDoubleClick: () => onMaximize?.(),
    ...listeners,
    className: twMerge(
      "group/reveal relative flex h-5 max-w-56 shrink-0 touch-none items-center rounded-sm pr-0.5",
      /* The open pane rises off the strip rather than marking itself with a
         rule: DS-GROUND. */
      active && "bg-surface-800 text-surface-100",
      !active && "text-surface-400 hover:bg-surface-800/60 hover:text-surface-100",
      /* The overlay ghost is the drag preview, so the tab itself only marks
         the slot it left. */
      isDragging && "opacity-40",
    ),
  };
  const menued = onFloat !== undefined || onMaximize !== undefined || onClose !== undefined;

  const body = (
    <>
      <Tabs.Tab
        value={pane.id}
        className="min-w-0 shrink cursor-pointer gap-1 px-1.5 py-0 font-sans text-xs font-medium tracking-wide uppercase"
      >
        {pane.icon}
        <span className="truncate">{pane.title}</span>
      </Tabs.Tab>
      {/* On the open pane alone, so the other tabs keep their width. */}
      {onFloat && active && (
        <IconButton
          icon={<ArrowSquareOutIcon />}
          size="row"
          reveal
          onClick={() => onFloat(pane.id)}
          label={m.editor_pane_float_label({ title: pane.title })}
        />
      )}
      {onClose && (
        <IconButton
          icon={<XIcon />}
          size="row"
          reveal
          onClick={() => onClose(pane.id)}
          aria-label={`Close ${pane.title}`}
        />
      )}
    </>
  );

  if (!menued) {
    return (
      <>
        {caretBefore && <DropCaret />}
        <div {...tabProps}>{body}</div>
      </>
    );
  }

  return (
    <>
      {caretBefore && <DropCaret />}
      <ContextMenu.Root>
        <ContextMenu.Trigger render={<div {...tabProps} />}>{body}</ContextMenu.Trigger>
        <ContextMenu.Content className="w-44">
          {onFloat && (
            <ContextMenu.Item
              icon={<ArrowSquareOutIcon className="size-4" />}
              onClick={() => onFloat(pane.id)}
            >
              {m.editor_pane_float_action()}
            </ContextMenu.Item>
          )}
          {onMaximize && !maximized && (
            <ContextMenu.Item
              icon={<ArrowsOutSimpleIcon className="size-4" />}
              onClick={onMaximize}
            >
              {m.editor_pane_maximize_action()}
            </ContextMenu.Item>
          )}
          {onMaximize && maximized && (
            <ContextMenu.Item icon={<ArrowsInSimpleIcon className="size-4" />} onClick={onMaximize}>
              {m.editor_pane_restore_action()}
            </ContextMenu.Item>
          )}
          {onClose && (
            <>
              <ContextMenu.Separator />
              <ContextMenu.Item
                icon={<XIcon className="size-4" />}
                onClick={() => onClose(pane.id)}
              >
                {m.editor_tab_close_action()}
              </ContextMenu.Item>
            </>
          )}
        </ContextMenu.Content>
      </ContextMenu.Root>
    </>
  );
}

function DropCaret() {
  return <span aria-hidden="true" className="h-5 w-0.5 shrink-0 rounded-full bg-accent-500" />;
}

import { DotsThreeVerticalIcon } from "@phosphor-icons/react";
import { createContext, type MouseEvent, type ReactNode, use, useRef, useState } from "react";

import { IconButton, Menu } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { TreeCaret, TreeRowCount } from "../../shared/components/TreeRowParts";
import type { DropTarget } from "../utils/outlineDrop";
import { entryTitle, moduleTitle, type OutlineNode, type OutlineShape } from "../utils/outlineTree";
import { type OutlineMenuHandlers, OutlineMenuItems } from "./OutlineMenuItems";

/** What every row of one outline reads alike. */
export interface OutlineRowShared {
  shape: OutlineShape;
  /** The menu and the actions, null for an outline that offers none. */
  handlers: OutlineMenuHandlers | null;
  /** The module whose name is being typed over, by item id. */
  renamingId: string | null;
  endRename: () => void;
  /** Where the row being dragged would land, drawn on the module row it names. */
  drop: DropTarget | null;
  /** The row being dragged, by item id. */
  draggedId: string | null;
  /** Whether the click under way is the one that ended a drag. */
  isDragClick: () => boolean;
}

export const OutlineRowContext = createContext<OutlineRowShared | null>(null);

export function useOutlineRow(): OutlineRowShared {
  const shared = use(OutlineRowContext);
  if (shared === null) throw new Error("An outline row drew outside its DeclarationsTree");
  return shared;
}

export function Caret({
  isExpanded,
  onClick,
}: {
  isExpanded: boolean;
  onClick: (event: MouseEvent) => void;
}) {
  return (
    <span
      aria-hidden
      onClick={(event) => {
        event.stopPropagation();
        onClick(event);
      }}
      className="flex size-3 shrink-0 cursor-pointer items-center justify-center"
    >
      <TreeCaret isExpanded={isExpanded} />
    </span>
  );
}

export function OutlineCount({ value }: { value: number }) {
  return <TreeRowCount className="pl-2">{value.toLocaleString()}</TreeRowCount>;
}

/** Keeps a `reveal` action shown on the selected row, which the row's own keys act on. */
export const SELECTED_ROW_ACTION = "shrink-0 group-aria-selected/row:opacity-100";

/** The row's menu behind a kebab, the same list its context menu draws. DS-MENU-SCOPE. */
export function RowKebab({ node, className }: { node: OutlineNode; className?: string }) {
  const { handlers } = useOutlineRow();
  const [open, setOpen] = useState(false);
  if (handlers === null) return null;

  return (
    <Menu.Root open={open} onOpenChange={setOpen}>
      <Menu.Trigger
        render={
          <IconButton
            icon={<DotsThreeVerticalIcon />}
            tabIndex={-1}
            aria-label={m.workshop_declarations_more_action()}
            onClick={(event) => event.stopPropagation()}
            size="row"
            reveal
            className={twMerge(SELECTED_ROW_ACTION, className)}
          />
        }
      />
      <Menu.Content align="end" data-ui="DeclarationsTreeRow:menu" className="w-60">
        <OutlineMenuItems node={node} handlers={handlers} />
      </Menu.Content>
    </Menu.Root>
  );
}

interface NameInputProps {
  initial: string;
  /** The typed name, null for an empty one. */
  onCommit: (name: string | null) => void;
  onCancel: () => void;
  className?: string;
}

/** A module name typed over the name it replaces: Enter or leaving commits, Escape backs out. */
export function ModuleNameInput({ initial, onCommit, onCancel, className }: NameInputProps) {
  const [value, setValue] = useState(initial);
  /* The blur an unmount can raise after Enter or Escape must not answer a second time. */
  const settled = useRef(false);
  const settle = (answer: () => void) => {
    if (settled.current) return;
    settled.current = true;
    answer();
  };
  const commit = () => settle(() => onCommit(value.trim() === "" ? null : value.trim()));
  const cancel = () => settle(onCancel);

  return (
    <input
      autoFocus
      value={value}
      placeholder={m.workshop_bin_module_name_placeholder()}
      aria-label={m.workshop_bin_module_name_placeholder()}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          cancel();
        }
      }}
      onBlur={commit}
      className={twMerge(
        "min-w-0 rounded-sm border border-accent-500 bg-surface-800 px-1.5 py-0",
        "text-surface-100 outline-none select-text",
        className,
      )}
    />
  );
}

/** A small label beside a row's name. */
export function RowTag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={twMerge(
        "flex min-w-0 shrink items-center gap-1 font-sans text-fine text-surface-400",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** What follows the pointer while a row drags: the row's name. */
export function DragChip({ node }: { node: OutlineNode }) {
  let label = "";
  if (node.type === "module") label = moduleTitle(node.module);
  if (node.type === "entry") label = entryTitle(node.entry);
  if (node.type === "key") label = node.key.key;

  return (
    <span
      data-ui="DeclarationsTree:drag"
      className="inline-flex max-w-80 items-center truncate rounded-md border border-surface-600 bg-surface-800 px-2 py-0.5 text-row text-surface-100 shadow-lg"
    >
      {label}
    </span>
  );
}

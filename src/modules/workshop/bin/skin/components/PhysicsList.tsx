import { EyeIcon, EyeSlashIcon, WarningIcon } from "@phosphor-icons/react";
import { type KeyboardEvent, use, useEffect, useRef } from "react";

import { IconButton } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { SkinChoiceContext } from "../state/skinChoice";
import type { PhysicsItem } from "../utils/physicsItems";
import { Hint, useMarked } from "./PhysicsCells";

export interface PhysicsListProps {
  readonly items: readonly PhysicsItem[];
  /** The hash path of the picked item, and null where the list is empty. */
  readonly selected: string | null;
  /** Move the pick, which the arrow keys do. */
  readonly onSelect: (path: string) => void;
  /** Pick an item and show its fields, which a click, Enter and Space do. */
  readonly onOpen: (path: string) => void;
  /** The list's accessible name. */
  readonly label: string;
  /** What the list says where it holds nothing. */
  readonly empty: string;
}

/** Where each key moves the pick to, from the place `from` in a list of `count`. */
const MOVES: Record<string, ((from: number, count: number) => number) | undefined> = {
  ArrowUp: (from) => Math.max(from - 1, 0),
  ArrowDown: (from, count) => Math.min(from + 1, count - 1),
  Home: () => 0,
  End: (_from, count) => count - 1,
};

/**
 * The pose modifiers or the sockets of a skin, one short row each, of which one is picked.
 *
 * "The physics pane" in docs/ux/SKIN_EDITOR.md.
 */
export function PhysicsList({ items, selected, onSelect, onOpen, label, empty }: PhysicsListProps) {
  if (items.length === 0) {
    return <Hint className="px-3 py-2">{empty}</Hint>;
  }

  const step = (event: KeyboardEvent, from: number) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(items[from].path);
      return;
    }

    const move = MOVES[event.key];
    if (move === undefined) return;

    event.preventDefault();
    onSelect(items[move(from, items.length)].path);
  };

  return (
    /* DS-SCROLLBAR */
    <div
      data-ui="PhysicsList"
      role="listbox"
      aria-label={label}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto py-1 scrollbar-md select-none"
    >
      {items.map((item, at) => (
        <Row
          key={item.path}
          item={item}
          selected={item.path === selected}
          onOpen={() => onOpen(item.path)}
          onKeyDown={(event) => step(event, at)}
        />
      ))}
    </div>
  );
}

interface RowProps {
  readonly item: PhysicsItem;
  readonly selected: boolean;
  readonly onOpen: () => void;
  readonly onKeyDown: (event: KeyboardEvent) => void;
}

function Row({ item, selected, onOpen, onKeyDown }: RowProps) {
  const choice = use(SkinChoiceContext);
  const marked = useMarked(item.path);
  const muted = choice?.muted.has(item.path) ?? false;
  const Eye = muted ? EyeSlashIcon : EyeIcon;
  const option = useRef<HTMLDivElement>(null);

  /* The pick moves with the arrow keys, and the focus follows it down the list. */
  useEffect(() => {
    const row = option.current;
    if (!selected || row === null) return;

    row.scrollIntoView?.({ block: "nearest" });
    if (row.closest('[role="listbox"]')?.contains(document.activeElement)) row.focus();
  }, [selected]);

  return (
    <div
      role="none"
      data-ui="PhysicsList:row"
      /* DS-RADIUS, DS-VEIL */
      className={twMerge(
        "mx-1 flex h-6 shrink-0 items-center rounded-sm pr-1 text-row hover:bg-surface-veil",
        selected && "bg-accent-500/15 hover:bg-accent-500/25",
      )}
    >
      <div
        ref={option}
        role="option"
        aria-selected={selected}
        tabIndex={selected ? 0 : -1}
        /* DS-RADIUS */
        className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-sm pl-1.5 outline-none focus-visible:ring-1 focus-visible:ring-accent-500"
        onClick={onOpen}
        onKeyDown={onKeyDown}
      >
        <item.icon
          aria-hidden
          className={twMerge("size-3.5 shrink-0 text-surface-400", selected && "text-accent-300")}
        />
        <span className={twMerge("shrink-0 text-surface-200", muted && "text-surface-400")}>
          {item.title}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-code text-surface-400">
          {item.detail}
        </span>
        {marked && <WarningIcon aria-hidden className="size-3 shrink-0 text-warning-text" />}
      </div>
      {choice !== null && item.previewed && (
        /* Out of the tab order: the head row of the picked item holds the same switch. */
        <IconButton
          size="row"
          tabIndex={-1}
          pressed={!muted}
          icon={<Eye />}
          label={m.workshop_bin_physics_preview_label()}
          onClick={() => choice.toggleMuted(item.path)}
        />
      )}
    </div>
  );
}

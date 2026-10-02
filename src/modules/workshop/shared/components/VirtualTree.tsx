import type { VirtualItem } from "@tanstack/react-virtual";
import type { ComponentProps, ReactNode, RefObject } from "react";

import { ContextMenu } from "@/components";
import { NO_OVERSCROLL } from "@/hooks";

import type { StickyRow } from "../utils/stickyTree";
import { TreeStickyBand } from "./TreeStickyBand";

interface VirtualTreeProps<Row> extends Omit<
  ComponentProps<typeof ContextMenu.Trigger>,
  "children" | "ref" | "role" | "className"
> {
  scrollRef: RefObject<HTMLDivElement | null>;
  rows: readonly Row[];
  /** `virtualizer.getVirtualItems()`, read in the component or hook that calls `useVirtualizer`. */
  items: readonly VirtualItem[];
  /** `virtualizer.getTotalSize()`. */
  totalSize: number;
  /** The pinned ancestors from `useStickyTreeRows`. A tree without them pins nothing. */
  sticky?: { readonly rows: readonly StickyRow<Row>[]; readonly height: number };
  /** One row, `pinned` where it draws in the band above the scroll. */
  renderRow: (row: Row, index: number, pinned: boolean) => ReactNode;
  /** The tree's context menu, aimed by the trigger's `onContextMenu`. */
  menu: ReactNode;
}

/**
 * The scrolling shell of a virtualized editor tree: the context menu trigger that scrolls, the
 * band of pinned ancestors, and the absolutely placed rows.
 *
 * The virtualizer stays in the caller, which hands over its items and total size. React Compiler
 * memoizes this component, so it reads nothing mutable off the virtualizer itself.
 *
 * With `sticky`, the rows sit inside a `py-1` box. The padding rides inside the scrollport, since
 * a sticky box is confined to its containing block and the scroll container's own padding would
 * hold the band that far below the top edge.
 */
export function VirtualTree<Row>({
  scrollRef,
  rows,
  items,
  totalSize,
  sticky,
  renderRow,
  menu,
  ...triggerProps
}: VirtualTreeProps<Row>) {
  const body = (
    <div
      role="presentation"
      data-tree-rows=""
      className="relative w-full"
      style={{ height: `${totalSize}px` }}
    >
      {items.map((item) => (
        <div
          key={item.key}
          role="presentation"
          className="absolute inset-x-0"
          style={{ transform: `translateY(${item.start}px)` }}
        >
          {renderRow(rows[item.index]!, item.index, false)}
        </div>
      ))}
    </div>
  );

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        ref={scrollRef}
        role="tree"
        tabIndex={-1}
        className="flex-1 overflow-auto text-row outline-none scrollbar-md scrollbar-track"
        {...NO_OVERSCROLL}
        {...triggerProps}
      >
        <PinnedFrame sticky={sticky} renderRow={renderRow}>
          {body}
        </PinnedFrame>
      </ContextMenu.Trigger>

      {menu}
    </ContextMenu.Root>
  );
}

interface PinnedFrameProps<Row> extends Pick<VirtualTreeProps<Row>, "sticky" | "renderRow"> {
  children: ReactNode;
}

/** The rows under the band of pinned ancestors, or the rows alone for a tree that pins none. */
function PinnedFrame<Row>({ sticky, renderRow, children }: PinnedFrameProps<Row>) {
  if (sticky === undefined) return children;

  return (
    <div className="py-1">
      <TreeStickyBand height={sticky.height}>
        {sticky.rows.map((pin, slot) => (
          <div
            key={pin.index}
            role="presentation"
            className="absolute inset-x-0 bg-surface-950"
            /* Outermost on top, so the innermost row slides away behind it. */
            style={{ top: `${pin.top}px`, zIndex: sticky.rows.length - slot }}
          >
            {renderRow(pin.row, pin.index, true)}
          </div>
        ))}
      </TreeStickyBand>
      {children}
    </div>
  );
}

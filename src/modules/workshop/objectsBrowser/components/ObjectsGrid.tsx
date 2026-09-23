import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button, ContextMenu } from "@/components";
import { useContentVisible, useReducedMotion, useZoomedPx } from "@/hooks";
import { m } from "@/i18n";

import { useMeasuredWidth } from "../../explorer/components/ExplorerSurface";
import type { ObjectsReveal } from "../../state";
import { useOpenObjectNode } from "../hooks/useOpenObjectNode";
import { objectPreviewKey, objectPreviewKind, playsOnHover } from "../utils/objectPreview";
import type { ObjectRowNode, ObjectTreeNode } from "../utils/objectTree";
import { ObjectPreviewSlot } from "./ObjectPreviewSlot";
import { ObjectsContextMenu } from "./ObjectsContextMenu";
import { ObjectTile } from "./ObjectTile";

const MAX_STILLS = 128;
const HOVER_MS = 180;
const PREVIEW_CONCURRENCY = 2;

interface ObjectsGridProps {
  nodes: readonly ObjectTreeNode[];
  thumbnails: boolean;
  size?: number;
  onDescend: (path: string) => void;
  onUp: () => void;
  reveal?: ObjectsReveal | null;
  onRevealed?: (token: number) => void;
}

/** Virtualized object tiles with bounded parallel previews and delayed hover playback. */
export function ObjectsGrid({
  nodes,
  thumbnails,
  size = 128,
  onDescend,
  onUp,
  reveal = null,
  onRevealed,
}: ObjectsGridProps) {
  const scroll = useRef<HTMLDivElement>(null);
  const width = useMeasuredWidth(scroll);
  const zoomed = useZoomedPx();
  const visible = useContentVisible();
  const reducedMotion = useReducedMotion();
  const open = useOpenObjectNode();
  const items = useMemo(
    () => nodes.filter((node) => node.type === "object" || node.type === "prefix"),
    [nodes],
  );
  const tileWidth = zoomed(size);
  const gap = zoomed(10);
  const columns = Math.max(1, Math.floor((width + gap) / (tileWidth + gap)));
  const artHeight = zoomed(Math.round(size * 0.72));
  const captionHeight = zoomed(42);
  const footerHeight = zoomed(24);
  const rowHeight = artHeight + captionHeight + footerHeight + gap + 2;
  const [focused, setFocused] = useState(0);
  const [aimed, setAimed] = useState<ObjectRowNode | null>(null);
  const [hovered, setHovered] = useState<ObjectRowNode | null>(null);
  const [stills, setStills] = useState<ReadonlyMap<string, string | null>>(new Map());
  const [menuNode, setMenuNode] = useState<ObjectTreeNode | null>(null);
  const [revision, setRevision] = useState(0);
  const [foreground, setForeground] = useState(() => !document.hidden);

  useEffect(() => {
    const changed = () => setForeground(!document.hidden);
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);

  useEffect(() => {
    setStills(new Map());
    setAimed(null);
    setHovered(null);
    setRevision((held) => held + 1);
  }, [nodes]);
  const virtualizer = useVirtualizer({
    count: Math.ceil(items.length / columns),
    getScrollElement: () => scroll.current,
    estimateSize: () => rowHeight,
    overscan: 1,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, columns, rowHeight]);

  useEffect(() => {
    const timer = window.setTimeout(() => setHovered(aimed), HOVER_MS);
    return () => window.clearTimeout(timer);
  }, [aimed]);

  const rows = virtualizer.getVirtualItems();
  const revealed = useRef<ObjectsReveal | null>(null);
  useEffect(() => {
    if (reveal === null || revealed.current === reveal || !visible || width === 0) {
      return;
    }

    const index = items.findIndex((node) => node.id === reveal.path);
    if (index < 0) {
      revealed.current = reveal;
      onRevealed?.(reveal.token);
      return;
    }

    setFocused(index);
    virtualizer.scrollToIndex(Math.floor(index / columns), { align: "auto" });
    const frame = requestAnimationFrame(() => {
      const tile = scroll.current?.querySelector<HTMLElement>(`[data-object-index="${index}"]`);
      if (tile) {
        tile.focus();
        revealed.current = reveal;
        onRevealed?.(reveal.token);
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [reveal, rows, items, columns, visible, width, virtualizer, onRevealed]);
  const inView = rows.flatMap((row) => items.slice(row.index * columns, (row.index + 1) * columns));
  const candidates = inView.filter(
    (node): node is ObjectRowNode => node.type === "object" && objectPreviewKind(node) !== null,
  );
  const hoveredVisible =
    hovered !== null &&
    candidates.some((node) => objectPreviewKey(node) === objectPreviewKey(hovered));
  const live =
    hoveredVisible && !reducedMotion && playsOnHover(objectPreviewKind(hovered!)) ? hovered : null;
  const enabled = thumbnails && visible && foreground;
  const pending = candidates.filter((node) => !stills.has(objectPreviewKey(node)) && node !== live);
  const wanted = enabled ? [...(live ? [live] : []), ...pending].slice(0, PREVIEW_CONCURRENCY) : [];
  const heldSlots = useRef<(ObjectRowNode | null)[]>(Array(PREVIEW_CONCURRENCY).fill(null));
  const slots = heldSlots.current.map((held) => wanted.find((node) => node === held) ?? null);
  for (const node of wanted) {
    if (!slots.includes(node)) {
      slots[slots.indexOf(null)] = node;
    }
  }

  heldSlots.current = slots;
  const jobKeys = new Set(wanted.map(objectPreviewKey));
  const currentRequests = useRef(new Set<string>());
  currentRequests.current = new Set([...jobKeys].map((key) => `${revision}:${key}`));

  const save = useCallback((key: string, image: string | null) => {
    setStills((previous) => {
      if (previous.has(key) && (previous.get(key) !== null || image === null)) {
        return previous;
      }

      const next = new Map(previous);
      next.set(key, image);
      while (next.size > MAX_STILLS) {
        next.delete(next.keys().next().value!);
      }

      return next;
    });
  }, []);
  const onImage = useCallback(
    (key: string, generation: number, image: string | null) => {
      if (currentRequests.current.has(`${generation}:${key}`)) {
        save(key, image);
      }
    },
    [save],
  );

  const focus = (index: number) => {
    const next = Math.max(0, Math.min(items.length - 1, index));
    setFocused(next);
    virtualizer.scrollToIndex(Math.floor(next / columns));
    requestAnimationFrame(() =>
      scroll.current?.querySelector<HTMLElement>(`[data-object-index="${next}"]`)?.focus(),
    );
  };

  return (
    <div data-ui="ObjectsGrid" className="relative flex min-h-0 flex-1 flex-col">
      <ContextMenu.Root>
        <ContextMenu.Trigger className="flex min-h-0 flex-1 flex-col">
          <div
            ref={scroll}
            role="grid"
            tabIndex={-1}
            aria-label={m.workshop_objects_title()}
            aria-rowcount={Math.ceil(items.length / columns)}
            aria-colcount={columns}
            className="min-h-0 flex-1 overflow-auto p-2 select-none"
            onPointerLeave={() => setAimed(null)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setAimed(null);
              }
            }}
            onKeyDown={(event) => {
              const offsets: Record<string, number> = {
                ArrowRight: 1,
                ArrowLeft: -1,
                ArrowDown: columns,
                ArrowUp: -columns,
              };
              if (event.ctrlKey && event.key === "Enter") {
                event.preventDefault();
                const node = items[focused];
                if (node?.type === "object") {
                  open(node, "beside");
                }
              } else if (event.key === "Backspace" || (event.altKey && event.key === "ArrowUp")) {
                event.preventDefault();
                onUp();
              } else if (event.key in offsets) {
                event.preventDefault();
                focus(focused + offsets[event.key]!);
              } else if (event.key === "Home" || event.key === "End") {
                event.preventDefault();
                focus(event.key === "Home" ? 0 : items.length - 1);
              } else if (event.key === "Escape") {
                setAimed(null);
                setHovered(null);
              }
            }}
          >
            <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
              {rows.map((row) => (
                <div
                  key={row.key}
                  role="row"
                  aria-rowindex={row.index + 1}
                  className="absolute inset-x-0 grid"
                  style={{
                    transform: `translateY(${row.start}px)`,
                    gridTemplateColumns: `repeat(${columns}, minmax(0, ${tileWidth}px))`,
                    gap,
                  }}
                >
                  {items
                    .slice(row.index * columns, (row.index + 1) * columns)
                    .map((node, column) => {
                      const index = row.index * columns + column;
                      const object = node.type === "object";
                      const key = object ? objectPreviewKey(node) : null;
                      const image = thumbnails && key !== null ? stills.get(key) : undefined;
                      const aim = () =>
                        setAimed(object && objectPreviewKind(node) !== null ? node : null);

                      return (
                        <div
                          key={node.id}
                          role="gridcell"
                          aria-colindex={column + 1}
                          onContextMenu={() => setMenuNode(node)}
                        >
                          <ObjectTile
                            node={node}
                            index={index}
                            focused={index === Math.min(focused, items.length - 1)}
                            artHeight={artHeight}
                            captionHeight={captionHeight}
                            footerHeight={footerHeight}
                            image={image}
                            loading={
                              thumbnails && key !== null && jobKeys.has(key) && !stills.has(key)
                            }
                            onAim={aim}
                            onLeave={() => setAimed(null)}
                            onFocus={() => {
                              setFocused(index);
                              aim();
                            }}
                            onDescend={onDescend}
                          />
                        </div>
                      );
                    })}
                </div>
              ))}
            </div>
          </div>
        </ContextMenu.Trigger>
        <ObjectsContextMenu node={menuNode} onOpen={open} />
      </ContextMenu.Root>
      {thumbnails && [...stills.values()].some((image) => image === null) && (
        <div className="flex shrink-0 items-center justify-end border-t border-surface-veil-strong px-2 py-1">
          <Button
            size="xs"
            compact
            variant="ghost"
            onClick={() => {
              setStills((held) => new Map([...held].filter(([, image]) => image !== null)));
              setRevision((held) => held + 1);
            }}
          >
            {m.workshop_objects_preview_retry_action()}
          </Button>
        </div>
      )}
      {enabled &&
        slots.map((job, slot) => (
          <ObjectPreviewSlot
            key={slot}
            scroll={scroll}
            targetIndex={job !== null && job === live ? items.indexOf(job) : null}
            onEnter={() => setAimed(job)}
            onLeave={() => setAimed(null)}
            onClose={() => {
              setAimed(null);
              setHovered(null);
            }}
            node={job}
            revision={revision}
            onImage={onImage}
          />
        ))}
    </div>
  );
}

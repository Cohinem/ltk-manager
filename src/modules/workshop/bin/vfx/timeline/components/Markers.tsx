import { FlagIcon, PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { ContextMenu, Field, useToast } from "@/components";
import { m } from "@/i18n";

import type { TimelineMarkerList } from "../hooks/useTimelineMarkers";
import type { TimeSnap } from "../hooks/useTimeSnap";
import { type TimeWindow, timeAt, xOf } from "../utils/laneModel";
import type { TimelineMarker } from "../utils/markers";

/** How far a pointer moves on a marker before a press is a drag rather than a click, in pixels. */
const DRAG_SLOP = 3;

interface MarkerRulerProps {
  view: TimeWindow;
  width: number;
  snap: TimeSnap;
  markers: TimelineMarkerList;
  onSeek: (time: number) => void;
  /** The ruler and the flags drawn over it. */
  children: ReactNode;
}

/** Where a context menu opened: the time it adds a marker at, and the marker under it. */
interface MenuAt {
  readonly time: number;
  readonly marker: string | null;
}

/**
 * The ruler's markers and its menu, per "The timeline" in docs/ux/BIN_EDITOR.md.
 *
 * A marker is a flag at the top of the ruler. A click on it seeks there, a drag moves it and
 * snaps, and a double click names it. The menu adds a marker where it opened, and on a marker
 * renames or deletes it.
 */
export function MarkerRuler({ view, width, snap, markers, onSeek, children }: MarkerRulerProps) {
  const box = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuAt | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const { toast } = useToast();

  const remove = (id: string) => {
    const marker = markers.markers.find((each) => each.id === id);
    if (marker === undefined) return;

    markers.remove(id);
    toast({
      title: m.workshop_bin_timeline_marker_deleted_title(),
      actions: [
        {
          label: m.workshop_bin_timeline_marker_undo_action(),
          onClick: () => markers.restore(marker),
        },
      ],
    });
  };

  const timeOf = (clientX: number) =>
    timeAt(view, width, clientX - (box.current?.getBoundingClientRect().left ?? 0));

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        ref={box}
        className="absolute inset-0"
        onContextMenuCapture={(event) => {
          const flag = (event.target as Element).closest("[data-marker]");
          setMenu({
            time: snap(timeOf(event.clientX), event).time,
            marker: flag?.getAttribute("data-marker") ?? null,
          });
        }}
      >
        {children}
        {markers.markers.map((marker) => (
          <MarkerFlag
            key={marker.id}
            marker={marker}
            view={view}
            width={width}
            renaming={renaming === marker.id}
            timeOf={timeOf}
            snap={snap}
            onMove={(time) => markers.move(marker.id, time)}
            onSeek={onSeek}
            onRename={() => setRenaming(marker.id)}
            onRenamed={(name) => {
              if (name !== null) markers.rename(marker.id, name);
              setRenaming(null);
            }}
          />
        ))}
      </ContextMenu.Trigger>
      {/* A rename's field takes focus, which the ruler taking it back would end at once. */}
      <ContextMenu.Content finalFocus={false}>
        {menu?.marker != null && (
          <>
            <ContextMenu.Item icon={<PencilSimpleIcon />} onClick={() => setRenaming(menu.marker)}>
              {m.workshop_bin_timeline_marker_rename_action()}
            </ContextMenu.Item>
            <ContextMenu.Item
              icon={<TrashIcon />}
              onClick={() => menu.marker !== null && remove(menu.marker)}
            >
              {m.workshop_bin_timeline_marker_delete_action()}
            </ContextMenu.Item>
            <ContextMenu.Separator />
          </>
        )}
        <ContextMenu.Item
          icon={<FlagIcon />}
          onClick={() => menu !== null && markers.add(menu.time)}
        >
          {m.workshop_bin_timeline_marker_add_action()}
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Root>
  );
}

interface MarkerFlagProps {
  marker: TimelineMarker;
  view: TimeWindow;
  width: number;
  renaming: boolean;
  timeOf: (clientX: number) => number;
  snap: TimeSnap;
  onMove: (time: number) => void;
  onSeek: (time: number) => void;
  onRename: () => void;
  /** The name typed, or null where the rename was dropped. */
  onRenamed: (name: string | null) => void;
}

/** One marker's flag, and its name field while it is renamed. */
function MarkerFlag({
  marker,
  view,
  width,
  renaming,
  timeOf,
  snap,
  onMove,
  onSeek,
  onRename,
  onRenamed,
}: MarkerFlagProps) {
  const press = useRef<{ x: number; moved: boolean } | null>(null);
  const [draft, setDraft] = useState<number | null>(null);
  const time = draft ?? marker.time;
  const label = markerLabel(marker);

  useEffect(() => {
    if (draft === null) return;

    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      event.stopPropagation();
      press.current = null;
      setDraft(null);
    };
    window.addEventListener("keydown", cancel, true);
    return () => window.removeEventListener("keydown", cancel, true);
  }, [draft]);

  return (
    <div
      data-marker={marker.id}
      role="button"
      tabIndex={-1}
      aria-label={label}
      title={label}
      className="absolute top-0 flex h-3.5 cursor-ew-resize touch-none items-start gap-0.5"
      style={{ left: xOf(view, width, time) - 4 }}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (event.button !== 0) return;

        event.currentTarget.setPointerCapture(event.pointerId);
        press.current = { x: event.clientX, moved: false };
      }}
      onPointerMove={(event) => {
        const pressed = press.current;
        if (pressed === null) return;
        if (!pressed.moved && Math.abs(event.clientX - pressed.x) < DRAG_SLOP) return;

        pressed.moved = true;
        setDraft(snap(timeOf(event.clientX), event, { marker: marker.id }).time);
      }}
      onPointerUp={(event) => {
        const pressed = press.current;
        press.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        if (pressed === null) return;

        if (pressed.moved && draft !== null) {
          onMove(draft);
        } else {
          onSeek(marker.time);
        }
        setDraft(null);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onRename();
      }}
    >
      <span
        aria-hidden="true"
        className="h-3 w-2 shrink-0 bg-surface-200 [clip-path:polygon(0_0,100%_0,100%_70%,50%_100%,0_70%)]"
      />
      {renaming && <MarkerName marker={marker} onRenamed={onRenamed} />}
      {!renaming && marker.name !== null && (
        <span className="max-w-24 truncate text-fine leading-3 text-surface-200">
          {marker.name}
        </span>
      )}
    </div>
  );
}

/** The field a marker is named in: Enter or leaving it keeps the name, Escape drops it. */
function MarkerName({
  marker,
  onRenamed,
}: {
  marker: TimelineMarker;
  onRenamed: (name: string | null) => void;
}) {
  const done = useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;

    done.current = true;
    onRenamed(name);
  };

  return (
    <Field.Control
      autoFocus
      aria-label={m.workshop_bin_timeline_marker_name_placeholder()}
      placeholder={m.workshop_bin_timeline_marker_name_placeholder()}
      defaultValue={marker.name ?? ""}
      className="h-4 w-28 px-1 text-fine"
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") finish(event.currentTarget.value);
        if (event.key === "Escape") finish(null);
      }}
      onBlur={(event) => finish(event.currentTarget.value)}
    />
  );
}

/** Each marker's line down the lanes. */
export function MarkerLines({
  markers,
  view,
  width,
}: {
  markers: readonly TimelineMarker[];
  view: TimeWindow;
  width: number;
}) {
  return (
    <>
      {markers.map((marker) => (
        <span
          key={marker.id}
          aria-hidden="true"
          className="absolute inset-y-0 w-0 border-l border-dashed border-surface-400/50"
          style={{ left: xOf(view, width, marker.time) }}
        />
      ))}
    </>
  );
}

/** What a marker reads as to a screen reader and on hover: its name and its time. */
function markerLabel(marker: TimelineMarker): string {
  const time = marker.time.toFixed(2);
  if (marker.name === null) return m.workshop_bin_timeline_marker_label({ time });
  return m.workshop_bin_timeline_marker_named_label({ name: marker.name, time });
}

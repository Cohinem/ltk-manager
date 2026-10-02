import { useMemo } from "react";

import { useOptionalProjectContext } from "../../../../projects/state/ProjectContext";
import { useWorkshopEditorStore } from "../../../../shell/state/workshopEditor";
import { useVfxRun } from "../../playback/state/run";
import {
  addedMarker,
  markerKey,
  movedMarker,
  removedMarker,
  renamedMarker,
  restoredMarker,
  type TimelineMarker,
} from "../utils/markers";

/** The markers of the open system, and what changes them. */
export interface TimelineMarkerList {
  readonly markers: readonly TimelineMarker[];
  readonly add: (time: number) => void;
  readonly move: (id: string, time: number) => void;
  /** A blank name clears it. */
  readonly rename: (id: string, name: string) => void;
  readonly remove: (id: string) => void;
  /** Put a removed marker back. */
  readonly restore: (marker: TimelineMarker) => void;
}

const NO_MARKERS: readonly TimelineMarker[] = [];

/**
 * The open system's timeline markers, kept in its project's `.ltk/editor.json`.
 *
 * Null for a system outside a project, and for one keyed on the open rather than a file, which
 * has nowhere to keep them. An action reads the store's markers when it runs, so one
 * raised later, such as a toast's Undo, never writes over a newer list.
 */
export function useTimelineMarkers(): TimelineMarkerList | null {
  const project = useOptionalProjectContext();
  const { asset, entry } = useVfxRun();
  const key = asset === null ? null : markerKey(asset, entry);
  const path = project?.path ?? null;

  const markers = useWorkshopEditorStore((state) =>
    path === null || key === null ? undefined : state.byProject[path]?.markers?.[key],
  );
  const setMarkers = useWorkshopEditorStore((state) => state.setTimelineMarkers);

  return useMemo(() => {
    if (path === null || key === null) return null;

    const current = () =>
      useWorkshopEditorStore.getState().byProject[path]?.markers?.[key] ?? NO_MARKERS;
    const change = (next: (list: readonly TimelineMarker[]) => readonly TimelineMarker[]) =>
      setMarkers(path, key, next(current()));
    return {
      markers: markers ?? NO_MARKERS,
      add: (time) => change((list) => addedMarker(list, time, crypto.randomUUID())),
      move: (id, time) => change((list) => movedMarker(list, id, time)),
      rename: (id, name) => change((list) => renamedMarker(list, id, name)),
      remove: (id) => change((list) => removedMarker(list, id)),
      restore: (marker) => change((list) => restoredMarker(list, marker)),
    };
  }, [path, key, markers, setMarkers]);
}

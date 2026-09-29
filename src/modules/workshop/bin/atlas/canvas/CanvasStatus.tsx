import { MinusIcon, PlusIcon } from "@phosphor-icons/react";

import { Button, IconButton, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { ReadOnly } from "@/lib/tauri";

import { KeyHint } from "../components/KeyHint";
import { ReadOnlyNote } from "../components/ReadOnlyNote";
import type { ResizeBlock } from "../engine/edit/targets";
import type { PixelRect } from "../engine/layout/solve";
import { usePointer } from "../state/atlasPreview";
import { CANVAS_KEYS } from "./canvasKeys";
import { CanvasShortcuts } from "./CanvasShortcuts";
import { type ViewTransformControl, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from "./useViewTransform";

export interface CanvasStatusProps {
  readonly transform: ViewTransformControl;
  /** The primary selection's name and rect and how many are selected, null for no selection. */
  readonly selection: {
    readonly label: string;
    readonly rect: PixelRect | null;
    readonly count: number;
  } | null;
  /** How the canvas takes edits: read-only with why, or what the selection can do. */
  readonly editing: CanvasEditing;
}

/** Whether the canvas edits, and where it does, why its selection draws no handles. */
export type CanvasEditing =
  | { readonly kind: "none" }
  | { readonly kind: "readOnly"; readonly reason: ReadOnly | null }
  | { readonly kind: "edit"; readonly block: ResizeBlock | null; readonly selected: boolean };

/**
 * The strip under the canvas: the screen pixel under the pointer, the selected element's rect,
 * whether the canvas edits and how the selection resizes, and the zoom, stepped, set to 100% or
 * fitted.
 */
export function CanvasStatus({ transform, selection, editing }: CanvasStatusProps) {
  const pointer = usePointer();
  const zoom = transform.view.zoom;

  return (
    <div
      data-ui="CanvasStatus"
      className="flex h-8 shrink-0 items-center gap-3 border-t border-surface-700/50 bg-surface-900 px-3 font-mono text-xs text-surface-400 select-none"
    >
      <span className="w-24 shrink-0 tabular-nums">
        {pointer !== null &&
          m.workshop_bin_atlas_pointer_label({
            x: Math.floor(pointer[0]),
            y: Math.floor(pointer[1]),
          })}
      </span>
      {selection !== null && (
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-surface-200 select-text">{selection.label}</span>
          {selection.count > 1 && (
            <span className="shrink-0 tabular-nums">
              {m.workshop_bin_atlas_selection_more_label({ count: selection.count - 1 })}
            </span>
          )}
          {selection.rect !== null && (
            <span className="shrink-0 tabular-nums select-text">
              {m.workshop_bin_atlas_rect_label({
                x: round(selection.rect.x),
                y: round(selection.rect.y),
                w: round(selection.rect.w),
                h: round(selection.rect.h),
              })}
            </span>
          )}
        </span>
      )}

      <EditingNote editing={editing} />

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <CanvasShortcuts />
        <Tooltip
          content={
            <KeyHint label={m.workshop_preview_zoom_out_label()} shortcut={CANVAS_KEYS.zoomOut} />
          }
        >
          <IconButton
            variant="ghost"
            size="xs"
            compact
            aria-label={m.workshop_preview_zoom_out_label()}
            icon={<MinusIcon className="h-4 w-4" weight="bold" />}
            disabled={zoom <= ZOOM_MIN}
            onClick={() => transform.zoomBy(1 / ZOOM_STEP)}
          />
        </Tooltip>
        <Tooltip
          content={
            <KeyHint label={m.workshop_preview_zoom_actual_label()} shortcut={CANVAS_KEYS.actual} />
          }
        >
          <Button
            variant="ghost"
            size="xs"
            compact
            className="min-w-12 tabular-nums"
            onClick={() => transform.zoomTo(1)}
          >
            {m.workshop_preview_zoom_percent_label({ percent: Math.round(zoom * 100) })}
          </Button>
        </Tooltip>
        <Tooltip
          content={
            <KeyHint label={m.workshop_preview_zoom_in_label()} shortcut={CANVAS_KEYS.zoomIn} />
          }
        >
          <IconButton
            variant="ghost"
            size="xs"
            compact
            aria-label={m.workshop_preview_zoom_in_label()}
            icon={<PlusIcon className="h-4 w-4" weight="bold" />}
            disabled={zoom >= ZOOM_MAX}
            onClick={() => transform.zoomBy(ZOOM_STEP)}
          />
        </Tooltip>
        <Tooltip
          content={
            <KeyHint label={m.workshop_preview_zoom_fit_label()} shortcut={CANVAS_KEYS.fit} />
          }
        >
          <Button
            variant="ghost"
            size="xs"
            compact
            aria-pressed={transform.fitted}
            className={transform.fitted ? "text-accent-300" : undefined}
            onClick={transform.fit}
          >
            {m.workshop_preview_zoom_fit_action()}
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}

/** Whether the canvas edits: a read-only mark, or what the selection's handles do. */
function EditingNote({ editing }: { editing: CanvasEditing }) {
  if (editing.kind === "readOnly") return <ReadOnlyNote reason={editing.reason} />;

  const hint = editing.kind === "edit" && editing.selected ? blockHint(editing.block) : null;
  if (hint === null) return null;
  return <span className="min-w-0 truncate font-sans text-surface-500">{hint}</span>;
}

function blockHint(block: ResizeBlock | null): string {
  switch (block) {
    case null:
      return m.workshop_bin_atlas_resize_hint();
    case "many":
      return m.workshop_bin_atlas_resize_many_hint();
    case "group":
      return m.workshop_bin_atlas_resize_group_hint();
    case "fullScreen":
      return m.workshop_bin_atlas_position_full_hint();
    case "layout":
      return m.workshop_bin_atlas_resize_layout_hint();
  }
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

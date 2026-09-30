import {
  CaretRightIcon,
  EyeIcon,
  EyeSlashIcon,
  FrameCornersIcon,
  type Icon,
  ImageSquareIcon,
  SelectionIcon,
  SparkleIcon,
  SquaresFourIcon,
  StackIcon,
  TextTIcon,
} from "@phosphor-icons/react";

import { Tooltip } from "@/components";
import { m } from "@/i18n";
import type { UiLook } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { MatchedText } from "../../../shared/components/MatchedText";
import type { LayerRow } from "../engine/model/layers";
import type { IconThumb } from "../engine/model/sprites";
import { SpriteThumb } from "./SpriteThumb";

const KIND_ICON: Record<UiLook["kind"], Icon> = {
  icon: ImageSquareIcon,
  effect: SparkleIcon,
  text: TextTIcon,
  particle: SparkleIcon,
  region: SelectionIcon,
  scissor: FrameCornersIcon,
  group: SquaresFourIcon,
  spine: StackIcon,
  unknown: SelectionIcon,
};

/** How far each level of the tree steps in, in pixels. */
const INDENT = 12;

/** A row's sprite thumbnail, a pixel past the glyph it replaces on each side. */
const THUMB_SIZE = 16;

export interface LayerRowViewProps {
  /** The row's element id, which the tree names as its active descendant. */
  readonly domId: string;
  readonly row: LayerRow;
  /** The search, whose first match in the row's name and class is marked. */
  readonly query: string;
  /** The sprite an icon element draws, which stands in for its kind glyph. */
  readonly thumb: IconThumb | null;
  readonly hidden: boolean;
  /** Whether the variant drawn over the base changes the element. */
  readonly patched: boolean;
  readonly selected: boolean;
  readonly hovered: boolean;
  /** The row the keyboard stands on. */
  readonly active: boolean;
  readonly onFold: () => void;
  /** A click, `additive` where Ctrl, Shift or Cmd adds it to the selection. */
  readonly onActivate: (additive: boolean) => void;
  readonly onHover: () => void;
  readonly onHide: () => void;
  readonly onFrame: () => void;
  readonly onMenu: () => void;
}

/** One row of the layers pane: a scene or an element, with its fold, glyph and marks. */
export function LayerRowView({
  domId,
  row,
  query,
  thumb,
  hidden,
  patched,
  selected,
  hovered,
  active,
  onFold,
  onActivate,
  onHover,
  onHide,
  onFrame,
  onMenu,
}: LayerRowViewProps) {
  const Glyph = row.type === "scene" ? StackIcon : KIND_ICON[row.kind];

  return (
    <div
      id={domId}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-expanded={row.folds ? row.open : undefined}
      aria-selected={selected}
      className={twMerge(
        /* DS-VEIL, DS-RADIUS */
        "group/row flex h-full cursor-pointer items-center gap-1.5 rounded-sm pr-1 hover:bg-surface-veil-soft",
        selected && "bg-accent-500/15",
        hovered && !selected && "bg-surface-veil-soft",
        active && "ring-1 ring-accent-500/60 ring-inset",
        hidden && "text-surface-500",
      )}
      style={{ paddingLeft: row.depth * INDENT }}
      onClick={(event) => onActivate(event.ctrlKey || event.shiftKey || event.metaKey)}
      onDoubleClick={onFrame}
      onContextMenu={onMenu}
      onPointerEnter={onHover}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        className={twMerge(
          "flex h-4 w-3 shrink-0 cursor-pointer items-center justify-center text-surface-400",
          !row.folds && "invisible",
        )}
        onClick={(event) => {
          event.stopPropagation();
          onFold();
        }}
      >
        <CaretRightIcon weight="bold" className={twMerge("h-3 w-3", row.open && "rotate-90")} />
      </button>
      {thumb === null && <Glyph className="h-3.5 w-3.5 shrink-0 text-surface-400" />}
      {thumb !== null && (
        <SpriteThumb
          asset={thumb.asset}
          uv={thumb.uv}
          flip={thumb.flip}
          size={THUMB_SIZE}
          className="-mx-px"
        />
      )}
      <span className="min-w-0 truncate">
        <MatchedText text={row.label} query={query} />
      </span>
      {row.type === "scene" && row.enabled && <EnabledMark />}
      {patched && <PatchedMark />}
      <span className="ml-auto shrink-0 truncate pl-2 text-meta text-surface-400">
        {row.type === "scene" && row.layer}
        {row.type === "element" && <MatchedText text={row.className} query={query} />}
      </span>
      {row.type === "scene" && <EyeButton hidden={hidden} onClick={onHide} />}
    </div>
  );
}

/** The mark of a scene the file switches on itself. */
function EnabledMark() {
  const hint = m.workshop_bin_atlas_layers_enabled_hint();
  return (
    <Tooltip content={hint}>
      <span aria-label={hint} className="flex shrink-0">
        <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />
      </span>
    </Tooltip>
  );
}

/** The mark of an element the drawn variant changes. */
function PatchedMark() {
  const hint = m.workshop_bin_atlas_layers_patched_hint();
  return (
    <Tooltip content={hint}>
      <span aria-label={hint} className="flex shrink-0">
        <span className="h-1.5 w-1.5 rounded-full border border-accent-400" />
      </span>
    </Tooltip>
  );
}

function EyeButton({ hidden, onClick }: { hidden: boolean; onClick: () => void }) {
  const label = hidden
    ? m.workshop_bin_atlas_layers_show_action()
    : m.workshop_bin_atlas_layers_hide_action();
  const Eye = hidden ? EyeSlashIcon : EyeIcon;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      title={label}
      /* DS-VEIL, DS-RADIUS. A hidden scene keeps its eye on screen, since that is what says it is hidden. */
      className={twMerge(
        "flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-surface-400 hover:bg-surface-veil hover:text-surface-200",
        !hidden && "opacity-0 group-hover/row:opacity-100",
      )}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <Eye weight="bold" className="h-3.5 w-3.5" />
    </button>
  );
}

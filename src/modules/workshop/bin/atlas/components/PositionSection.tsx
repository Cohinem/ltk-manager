import { Checkbox, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { PropertyEdit } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { reanchorEdit } from "../engine/edit/arrange";
import {
  type AnchorChoice,
  type RectFlag,
  rectEdit,
  rectFlagEdit,
} from "../engine/edit/elementEdits";
import { type RectFields, rectFields } from "../engine/edit/rectEdit";
import { resizable } from "../engine/edit/targets";
import { HIERARCHY_STRETCH, type LayoutSettings, type PixelRect } from "../engine/layout/solve";
import type { ViewTree } from "../engine/model/tree";
import type { ViewAnchor, ViewElement, ViewRect } from "../engine/model/view";
import { DraftNumber, FieldLine, SectionBlock } from "./sectionParts";

export interface PositionSectionProps {
  readonly element: ViewElement;
  readonly tree: ViewTree;
  readonly settings: LayoutSettings;
  readonly solved: ReadonlyMap<string, PixelRect> | null;
  readonly editable: boolean;
  readonly apply: (edits: readonly PropertyEdit[]) => void;
}

const FRACTIONS = [0, 0.5, 1] as const;

/**
 * Where an element sits, over `Position`: its anchor as a grid of nine points, its rect in its
 * frame's pixels, and the switches that change how the rect scales. A re-anchor keeps the element
 * where it is on the screen. A stretched hierarchy axis shows its margins in place of its position
 * and size.
 */
export function PositionSection({
  element,
  tree,
  settings,
  solved,
  editable,
  apply,
}: PositionSectionProps) {
  const title = m.workshop_bin_section_position_label();
  const position = element.position;
  if (position === null) {
    return (
      <SectionBlock id="position" title={title}>
        <FieldLine label={m.workshop_bin_atlas_layout_label()}>
          {m.workshop_bin_atlas_position_none_hint()}
        </FieldLine>
      </SectionBlock>
    );
  }
  if (position.kind === "fullScreen") {
    return (
      <SectionBlock id="position" title={title}>
        <FieldLine label={m.workshop_bin_atlas_layout_label()}>
          {m.workshop_bin_atlas_position_full_hint()}
        </FieldLine>
      </SectionBlock>
    );
  }

  const rect = position.rect;
  const key = element.key;
  const writable = editable && resizable(tree, key);
  const fields = rectFields(rect);
  const write = (after: RectFields) => {
    const edit = rectEdit(key, fields, after);
    if (edit !== null) apply([edit]);
  };
  const reanchor = (choice: AnchorChoice) => {
    const edit = reanchorEdit(tree, settings, key, choice, parentOf(tree, solved, key, settings));
    if (edit !== null) apply([edit]);
  };
  const flag = (name: RectFlag, value: boolean) => apply([rectFlagEdit(key, name, value)]);

  return (
    <SectionBlock id="position" title={title}>
      <FieldLine label={m.workshop_bin_atlas_anchor_label()}>
        <AnchorGrid anchor={rect.anchor} disabled={!writable} onPick={reanchor} />
        <span className="min-w-0 truncate text-surface-400">{anchorHint(rect.anchor)}</span>
      </FieldLine>
      {rect.anchor.kind === "hierarchy" && (
        <FieldLine label="">
          {([0, 1] as const).map((axis) => (
            <StretchBox key={axis} rect={rect} axis={axis} disabled={!writable} onPick={reanchor} />
          ))}
        </FieldLine>
      )}
      {([0, 1] as const).map((axis) => (
        <AxisLine
          key={axis}
          rect={rect}
          fields={fields}
          axis={axis}
          disabled={!writable}
          write={write}
        />
      ))}
      <FieldLine label={m.workshop_bin_atlas_source_label()}>
        <span className="font-mono tabular-nums select-text">
          {m.workshop_bin_atlas_size_value({ w: rect.source[0], h: rect.source[1] })}
        </span>
      </FieldLine>
      <div className="col-span-2 flex flex-col gap-1 pt-1">
        <Checkbox
          size="sm"
          label={m.workshop_bin_atlas_ignore_hud_label()}
          checked={rect.ignoreGlobalScale}
          disabled={!writable}
          onCheckedChange={(value) => flag("IgnoreGlobalScale", value)}
        />
        <Checkbox
          size="sm"
          label={m.workshop_bin_atlas_ignore_safe_zone_label()}
          checked={rect.ignoreSafeZone}
          disabled={!writable}
          onCheckedChange={(value) => flag("IgnoreSafeZone", value)}
        />
        <Checkbox
          size="sm"
          label={m.workshop_bin_atlas_keep_source_size_label()}
          checked={rect.disableResolutionDownscale}
          disabled={!writable}
          onCheckedChange={(value) => flag("DisableResolutionDownscale", value)}
        />
        <Checkbox
          size="sm"
          label={m.workshop_bin_atlas_snap_x_label()}
          checked={!rect.disablePixelSnapping[0]}
          disabled={!writable}
          onCheckedChange={(value) => flag("DisablePixelSnappingX", !value)}
        />
        <Checkbox
          size="sm"
          label={m.workshop_bin_atlas_snap_y_label()}
          checked={!rect.disablePixelSnapping[1]}
          disabled={!writable}
          onCheckedChange={(value) => flag("DisablePixelSnappingY", !value)}
        />
      </div>
    </SectionBlock>
  );
}

/** Position and size on one axis, or a stretched hierarchy axis's two margins. */
function AxisLine({
  rect,
  fields,
  axis,
  disabled,
  write,
}: {
  rect: ViewRect;
  fields: RectFields;
  axis: 0 | 1;
  disabled: boolean;
  write: (after: RectFields) => void;
}) {
  const anchor = rect.anchor;
  const stretched = anchor.kind === "hierarchy" && anchor.align[axis] === HIERARCHY_STRETCH;
  const with_ = (pair: readonly [number, number], at: 0 | 1, value: number) =>
    (at === 0 ? [value, pair[1]] : [pair[0], value]) as [number, number];

  if (stretched && fields.margins !== null) {
    const margins = fields.margins;
    const [near, far] = margins[axis];
    const setMargin = (at: 0 | 1, value: number) =>
      write({
        ...fields,
        margins:
          axis === 0
            ? [with_(margins[0], at, value), margins[1]]
            : [margins[0], with_(margins[1], at, value)],
      });
    return (
      <FieldLine
        label={axis === 0 ? m.workshop_bin_atlas_x_label() : m.workshop_bin_atlas_y_label()}
      >
        <DraftNumber
          value={near}
          scrub={
            axis === 0
              ? m.workshop_bin_atlas_margin_left_label()
              : m.workshop_bin_atlas_margin_top_label()
          }
          disabled={disabled}
          onCommit={(value) => setMargin(0, value)}
        />
        <DraftNumber
          value={far}
          scrub={
            axis === 0
              ? m.workshop_bin_atlas_margin_right_label()
              : m.workshop_bin_atlas_margin_bottom_label()
          }
          disabled={disabled}
          onCommit={(value) => setMargin(1, value)}
        />
      </FieldLine>
    );
  }

  return (
    <FieldLine label={axis === 0 ? m.workshop_bin_atlas_x_label() : m.workshop_bin_atlas_y_label()}>
      <DraftNumber
        value={fields.position[axis]}
        scrub={axis === 0 ? m.workshop_bin_atlas_x_label() : m.workshop_bin_atlas_y_label()}
        disabled={disabled}
        onCommit={(value) => write({ ...fields, position: with_(fields.position, axis, value) })}
      />
      <DraftNumber
        value={fields.size[axis]}
        scrub={
          axis === 0 ? m.workshop_bin_atlas_width_label() : m.workshop_bin_atlas_height_label()
        }
        min={0}
        disabled={disabled}
        onCommit={(value) => write({ ...fields, size: with_(fields.size, axis, value) })}
      />
    </FieldLine>
  );
}

/** The nine points an anchor can take, the one the element holds lit. */
function AnchorGrid({
  anchor,
  disabled,
  onPick,
}: {
  anchor: ViewAnchor;
  disabled: boolean;
  onPick: (choice: AnchorChoice) => void;
}) {
  const held = heldPoint(anchor);

  return (
    <div className="grid shrink-0 grid-cols-3 gap-0.5">
      {FRACTIONS.flatMap((y, row) =>
        FRACTIONS.map((x, column) => {
          const lit = held !== null && held[0] === column && held[1] === row;
          const label = m.workshop_bin_atlas_anchor_point_action({ x, y });
          return (
            <Tooltip key={`${column}:${row}`} content={label}>
              <button
                type="button"
                aria-label={label}
                aria-pressed={lit}
                disabled={disabled}
                className={twMerge(
                  /* DS-RADIUS */
                  "h-3.5 w-3.5 rounded-sm border border-surface-600 bg-surface-800 enabled:cursor-pointer enabled:hover:border-accent-hover disabled:opacity-60",
                  lit && "border-accent-400 bg-accent-500",
                )}
                onClick={() => onPick(choiceAt(anchor, column, row))}
              />
            </Tooltip>
          );
        }),
      )}
    </div>
  );
}

/** A hierarchy axis's stretch switch, which keeps the element where it is either way. */
function StretchBox({
  rect,
  axis,
  disabled,
  onPick,
}: {
  rect: ViewRect;
  axis: 0 | 1;
  disabled: boolean;
  onPick: (choice: AnchorChoice) => void;
}) {
  const anchor = rect.anchor;
  if (anchor.kind !== "hierarchy") return null;

  const stretched = anchor.align[axis] === HIERARCHY_STRETCH;
  return (
    <Checkbox
      size="sm"
      label={
        axis === 0 ? m.workshop_bin_atlas_stretch_x_label() : m.workshop_bin_atlas_stretch_y_label()
      }
      checked={stretched}
      disabled={disabled}
      onCheckedChange={(on) => {
        const align: [number, number] = [...anchor.align];
        align[axis] = on ? HIERARCHY_STRETCH : anchor.pivot[axis];
        onPick({ kind: "hierarchy", align, pivot: anchor.pivot, margins: null });
      }}
    />
  );
}

/** The grid cell an anchor holds, and null for one no cell draws. */
function heldPoint(anchor: ViewAnchor): readonly [number, number] | null {
  if (anchor.kind === "none") return [0, 0];
  if (anchor.kind === "hierarchy") {
    const [x, y] = anchor.align;
    return x < HIERARCHY_STRETCH && y < HIERARCHY_STRETCH ? [x, y] : null;
  }
  if (anchor.kind === "double") return null;

  const column = FRACTIONS.indexOf(anchor.anchor[0] as 0 | 0.5 | 1);
  const row = FRACTIONS.indexOf(anchor.anchor[1] as 0 | 0.5 | 1);
  return column < 0 || row < 0 ? null : [column, row];
}

/** The anchor a grid cell picks: a point of the screen, or an align and pivot in the parent. */
function choiceAt(anchor: ViewAnchor, column: number, row: number): AnchorChoice {
  if (anchor.kind === "hierarchy") {
    return { kind: "hierarchy", align: [column, row], pivot: [column, row], margins: null };
  }
  return { kind: "single", anchor: [FRACTIONS[column] ?? 0, FRACTIONS[row] ?? 0] };
}

function anchorHint(anchor: ViewAnchor): string {
  if (anchor.kind === "hierarchy") return m.workshop_bin_atlas_anchor_parent_hint();
  if (anchor.kind === "double") return m.workshop_bin_atlas_anchor_double_hint();
  return m.workshop_bin_atlas_anchor_screen_hint();
}

/** The rect a hierarchy anchor places `key` in: its nearest positioned group's, or the screen. */
function parentOf(
  tree: ViewTree,
  solved: ReadonlyMap<string, PixelRect> | null,
  key: string,
  settings: LayoutSettings,
): PixelRect {
  const seen = new Set<string>([key]);
  let at = tree.groupOf.get(key);
  while (at !== undefined && !seen.has(at)) {
    seen.add(at);
    const rect = solved?.get(at);
    if ((tree.elements.get(at)?.position ?? null) !== null && rect !== undefined) return rect;
    at = tree.groupOf.get(at);
  }
  return { x: 0, y: 0, w: settings.screen.width, h: settings.screen.height };
}

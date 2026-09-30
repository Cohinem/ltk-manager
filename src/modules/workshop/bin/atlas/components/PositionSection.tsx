import { useState } from "react";

import { Checkbox } from "@/components";
import { m } from "@/i18n";
import type { PropertyEdit } from "@/lib/tauri";

import { type AnchorEdge, edgeOf, gapOf, positionOf } from "../engine/edit/anchorGaps";
import { reanchorEdit } from "../engine/edit/arrange";
import {
  type AnchorChoice,
  type RectFlag,
  rectEdit,
  rectFlagEdit,
} from "../engine/edit/elementEdits";
import { type RectFields, rectFields } from "../engine/edit/rectEdit";
import { resizable } from "../engine/edit/targets";
import {
  HIERARCHY_STRETCH,
  type LayoutSettings,
  type PixelRect,
  sourceOf,
} from "../engine/layout/solve";
import type { ViewTree } from "../engine/model/tree";
import type { ViewAnchor, ViewElement, ViewRect } from "../engine/model/view";
import { AnchorDiagram, type AnchorPoint } from "./AnchorDiagram";
import { DraftNumber, FieldLine, SectionBlock, ToggleLine } from "./sectionParts";

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
 * Where an element sits, over `Position`: its anchor as a diagram of the frame with the element in
 * it, the distance it keeps to the anchored edges in its design frame's pixels, its size, and the
 * switches that change how it scales. A re-anchor keeps the element where it is on the screen. A
 * stretched hierarchy axis shows its margins in place of its distance and size.
 */
export function PositionSection({
  element,
  tree,
  settings,
  solved,
  editable,
  apply,
}: PositionSectionProps) {
  const [previewed, setPreviewed] = useState<AnchorPoint | null>(null);
  const title = m.workshop_bin_section_position_label();
  const position = element.position;
  if (position === null || position.kind === "fullScreen") {
    return (
      <SectionBlock id="position" title={title}>
        <FieldLine label={m.workshop_bin_atlas_layout_label()}>
          {position === null
            ? m.workshop_bin_atlas_position_none_hint()
            : m.workshop_bin_atlas_position_full_hint()}
        </FieldLine>
      </SectionBlock>
    );
  }

  const rect = position.rect;
  const key = element.key;
  const writable = editable && resizable(tree, key);
  const fields = rectFields(rect);
  const source = sourceOf(rect, settings.screen);
  const write = (after: RectFields) => {
    const edit = rectEdit(key, fields, after);
    if (edit !== null) apply([edit]);
  };
  const frame = frameOf(tree, solved, key, settings, rect.anchor);
  const reanchor = (choice: AnchorChoice) => {
    const edit = reanchorEdit(tree, settings, key, choice, frame);
    if (edit !== null) apply([edit]);
  };
  const flag = (name: RectFlag, value: boolean) => apply([rectFlagEdit(key, name, value)]);

  return (
    <SectionBlock id="position" title={title}>
      <div className="col-span-2 flex items-center gap-2">
        <AnchorDiagram
          frame={frame}
          element={solved?.get(key) ?? null}
          held={heldPoint(rect.anchor)}
          previewed={writable ? previewed : null}
          disabled={!writable}
          pointLabel={(point) =>
            m.workshop_bin_atlas_anchor_pin_action({ point: pointName(point) })
          }
          onPick={(column, row) => reanchor(choiceAt(rect.anchor, column, row))}
          onPreview={setPreviewed}
        />
        <p className="min-w-0 text-meta text-surface-400 select-none">
          {anchorCaption(rect.anchor, writable ? previewed : null)}
        </p>
      </div>
      {rect.anchor.kind === "hierarchy" && (
        <div className="col-span-2 flex gap-3">
          {([0, 1] as const).map((axis) => (
            <StretchBox key={axis} rect={rect} axis={axis} disabled={!writable} onPick={reanchor} />
          ))}
        </div>
      )}
      {([0, 1] as const).map((axis) => (
        <AxisFields
          key={axis}
          rect={rect}
          fields={fields}
          source={source[axis]}
          axis={axis}
          disabled={!writable}
          write={write}
        />
      ))}
      <p className="col-span-2 text-meta text-surface-500 select-none">
        {m.workshop_bin_atlas_design_size_value({ w: source[0], h: source[1] })}
      </p>
      <h4 className="col-span-2 pt-1 text-meta font-medium text-surface-400 select-none">
        {m.workshop_bin_atlas_scaling_label()}
      </h4>
      <ToggleLine
        label={m.workshop_bin_atlas_follows_hud_label()}
        checked={!rect.ignoreGlobalScale}
        disabled={!writable}
        onChange={(value) => flag("IgnoreGlobalScale", !value)}
      />
      <ToggleLine
        label={m.workshop_bin_atlas_in_safe_zone_label()}
        checked={!rect.ignoreSafeZone}
        disabled={!writable}
        onChange={(value) => flag("IgnoreSafeZone", !value)}
      />
      <ToggleLine
        label={m.workshop_bin_atlas_min_design_size_label()}
        checked={rect.disableResolutionDownscale}
        disabled={!writable}
        onChange={(value) => flag("DisableResolutionDownscale", value)}
      />
      <ToggleLine
        label={m.workshop_bin_atlas_snap_x_label()}
        checked={!rect.disablePixelSnapping[0]}
        disabled={!writable}
        onChange={(value) => flag("DisablePixelSnappingX", !value)}
      />
      <ToggleLine
        label={m.workshop_bin_atlas_snap_y_label()}
        checked={!rect.disablePixelSnapping[1]}
        disabled={!writable}
        onChange={(value) => flag("DisablePixelSnappingY", !value)}
      />
    </SectionBlock>
  );
}

/**
 * One axis as two fields: the distance to the anchored edge and the size, a stretched hierarchy
 * axis's two margins, or the raw position and size where the anchor pins no single edge.
 */
function AxisFields({
  rect,
  fields,
  source,
  axis,
  disabled,
  write,
}: {
  rect: ViewRect;
  fields: RectFields;
  source: number;
  axis: 0 | 1;
  disabled: boolean;
  write: (after: RectFields) => void;
}) {
  const anchor = rect.anchor;
  const with_ = (pair: readonly [number, number], at: 0 | 1, value: number) =>
    (at === 0 ? [value, pair[1]] : [pair[0], value]) as [number, number];

  const stretched = anchor.kind === "hierarchy" && anchor.align[axis] === HIERARCHY_STRETCH;
  if (stretched && fields.margins !== null) {
    const margins = fields.margins;
    const [near, far] = margins[axis];
    const names = ["start", "end"] as const;
    const setMargin = (at: 0 | 1, value: number) =>
      write({
        ...fields,
        margins:
          axis === 0
            ? [with_(margins[0], at, value), margins[1]]
            : [margins[0], with_(margins[1], at, value)],
      });
    return (
      <div className="col-span-2 grid grid-cols-2 gap-1.5">
        {([near, far] as const).map((value, at) => {
          const label = edgeLabel(axis, names[at] ?? "start");
          return (
            <DraftNumber
              key={label}
              value={value}
              label={label}
              scrub={label}
              disabled={disabled}
              onCommit={(next) => setMargin(at as 0 | 1, next)}
            />
          );
        })}
      </div>
    );
  }

  const size = fields.size[axis];
  const sizeLabel =
    axis === 0 ? m.workshop_bin_atlas_width_label() : m.workshop_bin_atlas_height_label();
  const edge = anchor.kind === "single" ? edgeOf(anchor.anchor[axis]) : null;
  const place =
    edge === null
      ? {
          value: fields.position[axis],
          label: axis === 0 ? m.workshop_bin_atlas_x_label() : m.workshop_bin_atlas_y_label(),
          position: (value: number) => value,
        }
      : {
          value: gapOf(fields.position[axis], size, source, edge),
          label: edgeLabel(axis, edge),
          position: (value: number) => positionOf(value, size, source, edge),
        };

  return (
    <div className="col-span-2 grid grid-cols-2 gap-1.5">
      <DraftNumber
        value={place.value}
        label={place.label}
        scrub={place.label}
        disabled={disabled}
        onCommit={(value) =>
          write({ ...fields, position: with_(fields.position, axis, place.position(value)) })
        }
      />
      <DraftNumber
        value={size}
        label={sizeLabel}
        scrub={sizeLabel}
        min={0}
        disabled={disabled}
        onCommit={(value) => write({ ...fields, size: with_(fields.size, axis, value) })}
      />
    </div>
  );
}

/** The name of the edge an axis measures from, such as `Right` or `Middle`. */
function edgeLabel(axis: 0 | 1, edge: AnchorEdge): string {
  if (axis === 0) {
    if (edge === "start") return m.workshop_bin_atlas_margin_left_label();
    if (edge === "end") return m.workshop_bin_atlas_margin_right_label();
    return m.workshop_bin_atlas_edge_centre_label();
  }
  if (edge === "start") return m.workshop_bin_atlas_margin_top_label();
  if (edge === "end") return m.workshop_bin_atlas_margin_bottom_label();
  return m.workshop_bin_atlas_edge_middle_label();
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

/** What the anchor keeps, or what picking the point under the pointer would. */
function anchorCaption(anchor: ViewAnchor, previewed: AnchorPoint | null): string {
  if (previewed !== null) {
    return m.workshop_bin_atlas_anchor_pin_action({ point: pointName(previewed) });
  }
  if (anchor.kind === "double") return m.workshop_bin_atlas_anchor_double_hint();

  const held = heldPoint(anchor);
  const point = held === null ? pointName([0, 0]) : pointName(held);
  return anchor.kind === "hierarchy"
    ? m.workshop_bin_atlas_anchor_parent_value({ point })
    : m.workshop_bin_atlas_anchor_screen_value({ point });
}

/** A point's name, such as `top left` or `centre`. */
function pointName([x, y]: AnchorPoint): string {
  const names = [
    [
      m.workshop_bin_atlas_point_top_left_label,
      m.workshop_bin_atlas_point_top_label,
      m.workshop_bin_atlas_point_top_right_label,
    ],
    [
      m.workshop_bin_atlas_point_left_label,
      m.workshop_bin_atlas_point_centre_label,
      m.workshop_bin_atlas_point_right_label,
    ],
    [
      m.workshop_bin_atlas_point_bottom_left_label,
      m.workshop_bin_atlas_point_bottom_label,
      m.workshop_bin_atlas_point_bottom_right_label,
    ],
  ];
  const column = FRACTIONS.indexOf(edgeFraction(x));
  const row = FRACTIONS.indexOf(edgeFraction(y));
  return names[row]?.[column]?.() ?? "";
}

function edgeFraction(fraction: number): 0 | 0.5 | 1 {
  const edge = edgeOf(fraction);
  if (edge === "start") return 0;
  if (edge === "end") return 1;
  return 0.5;
}

/** The point an anchor pins, and null for one no single point draws. */
function heldPoint(anchor: ViewAnchor): AnchorPoint | null {
  if (anchor.kind === "none") return [0, 0];
  if (anchor.kind === "double") return null;
  if (anchor.kind === "hierarchy") {
    const [x, y] = anchor.align;
    return x < HIERARCHY_STRETCH && y < HIERARCHY_STRETCH ? [x / 2, y / 2] : null;
  }
  return [edgeFraction(anchor.anchor[0]), edgeFraction(anchor.anchor[1])];
}

/** The anchor a point picks: a point of the screen, or an align and pivot in the parent. */
function choiceAt(anchor: ViewAnchor, column: number, row: number): AnchorChoice {
  if (anchor.kind === "hierarchy") {
    return { kind: "hierarchy", align: [column, row], pivot: [column, row], margins: null };
  }
  return { kind: "single", anchor: [FRACTIONS[column] ?? 0, FRACTIONS[row] ?? 0] };
}

/**
 * The rect the anchor's points sit on: for a hierarchy anchor the nearest positioned group's, and
 * the screen otherwise.
 */
function frameOf(
  tree: ViewTree,
  solved: ReadonlyMap<string, PixelRect> | null,
  key: string,
  settings: LayoutSettings,
  anchor: ViewAnchor,
): PixelRect {
  const screen = { x: 0, y: 0, w: settings.screen.width, h: settings.screen.height };
  if (anchor.kind !== "hierarchy") return screen;

  const seen = new Set<string>([key]);
  let at = tree.groupOf.get(key);
  while (at !== undefined && !seen.has(at)) {
    seen.add(at);
    const rect = solved?.get(at);
    if ((tree.elements.get(at)?.position ?? null) !== null && rect !== undefined) return rect;
    at = tree.groupOf.get(at);
  }
  return screen;
}

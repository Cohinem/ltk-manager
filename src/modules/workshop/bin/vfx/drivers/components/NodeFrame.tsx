import { type CSSProperties, type PointerEvent, type ReactNode, use } from "react";

import { twMerge } from "@/utils";

import { ChangeMark } from "../../../documents/components/ChangeMark";
import { useChangedOnlyView } from "../../../documents/hooks/useChanges";
import { rowKey } from "../../../tree/utils/binRows";
import { previewHeight } from "../utils/driverLayout";
import type { GraphItem } from "../utils/graphItems";
import { itemHue } from "../utils/graphTones";
import { itemTitle } from "../utils/nodeText";
import { GraphActionsContext } from "./graphActions";
import { NodeLayerMark } from "./NodeLayerMark";
import { OnScreenContext, useOnScreen } from "./onScreen";
import { type PlateFace, plateFace } from "./PlateFace";

/**
 * The frame of every graph node, edged and washed in the item's hue.
 *
 * Under `FAR_ZOOM` its rows are too small to read, so a plate covers the node with its curve,
 * colour or value, or else its title, at a fixed screen size. A node whose body is a picture,
 * `plate="above"`, keeps the picture and sets the title over its top edge instead. An emitter
 * in a frame draws no plate, since the frame's title names it.
 *
 * It tells its parts whether the node is in view, through `OnScreenContext`, so a part that
 * follows the run stops while the node is out of view.
 */
export function NodeFrame({
  item,
  width,
  height,
  selected,
  dim = false,
  plate = "inside",
  dropTarget = false,
  children,
}: {
  item: GraphItem;
  width: number;
  height: number;
  selected: boolean;
  dim?: boolean;
  /**
   * Where the far zoom names the node: a plate over it, a title over its top edge for a
   * picture a column leaves room above, or nothing for a picture that names itself.
   */
  plate?: "inside" | "above" | "none";
  /** A texture or a mesh dragged from the content tree lands on the node. */
  dropTarget?: boolean;
  children: ReactNode;
}) {
  const hue = itemHue(item);
  const style = {
    width,
    height,
    borderTopColor: hue,
    "--preview-height": `${previewHeight(item, width)}px`,
    ...hueStyle(item),
  } as CSSProperties;
  const entry = use(GraphActionsContext)?.entry ?? "";
  const key = item.wire === "" || entry === "" ? null : rowKey({ entry, path: item.wire });
  const only = useChangedOnlyView();
  const unchanged = only !== null && key !== null && !only.rows.has(key) && !only.within.has(key);
  const [box, onScreen] = useOnScreen<HTMLDivElement>();

  return (
    <OnScreenContext value={onScreen}>
      <div
        ref={box}
        data-ui="SystemGraph:node"
        data-type-scale="board"
        data-asset-drop={dropTarget || undefined}
        style={style}
        onPointerEnter={markOver}
        onPointerLeave={clearOver}
        /* DS-GROUND, DS-RADIUS, DS-HOVER */
        className={twMerge(
          "relative flex flex-col rounded-lg border border-t-2 border-surface-veil-strong bg-surface-800 text-row shadow-md transition-[border-color,box-shadow] hover:border-accent-hover",
          selected && "border-accent-500 ring-2 ring-accent-500/40 hover:border-accent-500",
          dim && "opacity-80",
          unchanged && "opacity-30",
          "data-asset-over:border-accent-400 data-asset-over:ring-2 data-asset-over:ring-accent-500/50",
        )}
      >
        {children}
        {key !== null && (
          <ChangeMark
            rowKey={key}
            className="absolute -top-1 -right-1 z-10 size-2.5 ring-2 ring-surface-900"
          />
        )}
        {key !== null && (
          <NodeLayerMark
            rowKey={key}
            size="1rem"
            className="absolute -top-2 -left-2 z-10 rounded-full bg-surface-800 p-0.5 ring-2 ring-surface-900"
          />
        )}
        {plate === "inside" && (
          <InsidePlate title={itemTitle(item)} face={plateFace(item)} hue={hue} height={height} />
        )}
        {plate === "above" && <AbovePlate title={itemTitle(item)} />}
      </div>
    </OnScreenContext>
  );
}

/**
 * Classes that show a part of a node only while the pointer is over the node.
 *
 * They read `data-over`, which the frame writes on pointer enter and leave, and not the
 * node's `:hover`. Chromium keeps one invalidation set for every selector that puts `:hover`
 * on an ancestor, and Tailwind's `group-hover` rules, written `:is(:where(.group):hover *)`,
 * make that set the whole subtree. A node whose parts depended on its `:hover` in any form
 * was restyled whole on every move on or off it, several thousand elements for an expanded
 * emitter. An attribute has an invalidation set of its own, which holds these parts alone.
 */
export const SHOWN_OVER_NODE = "opacity-0 in-data-[over]:opacity-100";

function markOver(event: PointerEvent<HTMLElement>): void {
  event.currentTarget.dataset.over = "";
}

function clearOver(event: PointerEvent<HTMLElement>): void {
  delete event.currentTarget.dataset.over;
}

/** The hue a node of `item`'s type is drawn in, and its wash, as the variables its parts read. */
export function hueStyle(item: GraphItem): CSSProperties {
  const hue = itemHue(item);
  return {
    "--node-hue": hue,
    "--node-wash": `color-mix(in srgb, ${hue} 16%, transparent)`,
  } as CSSProperties;
}

/**
 * An item drawn in its socket rather than as a node, in the hue its node would carry: an edge
 * down its left and its wash fading across it, under `hueStyle`'s variables.
 */
export const EMBED_TONE =
  "border-l-2 border-(color:--node-hue) bg-linear-to-r from-(--node-wash) to-transparent to-60%";

/** Classes of a part that shows only above `FAR_ZOOM`, keyed off `data-detail` on the canvas. */
export const NEAR_ONLY = "transition-opacity in-data-[detail=far]:opacity-0";

/**
 * `NEAR_ONLY` for a node body's rows one by one, so a row marked `data-far-face` stays to draw
 * its own face under `FAR_ZOOM`, which a fade of the whole body would take with it.
 */
export const ROWS_NEAR_ONLY =
  "[&>*]:transition-opacity in-data-[detail=far]:[&>*:not([data-far-face])]:opacity-0";
const FAR_ONLY =
  "pointer-events-none opacity-0 transition-opacity in-data-[detail=far]:pointer-events-auto in-data-[detail=far]:opacity-100";

/**
 * An embedded item's face over its row under `FAR_ZOOM`: the plate face its own node would
 * show, in its hue from `hueStyle`, drawn above the node's own plate.
 */
export function RowPlate({ item }: { item: GraphItem }) {
  const face = plateFace(item);
  const text = face.type === "value" ? face.text : itemTitle(item);

  return (
    <div
      aria-hidden
      className={twMerge(
        "absolute inset-0 z-10 flex items-center justify-center overflow-hidden rounded-sm px-1.5 py-1",
        FAR_ONLY,
      )}
      style={{ background: "color-mix(in srgb, var(--node-hue) 22%, var(--color-surface-800))" }}
    >
      {face.type === "picture" && <div className="size-full">{face.picture}</div>}
      {face.type !== "picture" && (
        <span
          className={twMerge(
            "truncate font-semibold text-surface-50",
            face.type === "value" && "font-mono font-medium",
          )}
          style={{ fontSize: `min(${PLATE_TYPE}, ${ROW_TYPE_MAX}px)` }}
        >
          {text}
        </span>
      )}
    </div>
  );
}

/** The largest a row plate's text grows, in canvas units, so it stays inside its row. */
const ROW_TYPE_MAX = 20;

/** A plate's text at 15 screen pixels, which `--graph-zoom` on the canvas turns to canvas units. */
const PLATE_TYPE = "calc(15px / var(--graph-zoom, 1))";

/** The height under which a plate fits one line of text rather than two. */
const TWO_LINE_HEIGHT = 96;

/** The average advance of the plate's faces, as a share of their size. */
const TEXT_ADVANCE = 0.6;

interface InsidePlateProps {
  title: string;
  face: PlateFace;
  hue: string;
  height: number;
}

function InsidePlate({ title, face, hue, height }: InsidePlateProps) {
  return (
    <div
      aria-hidden
      className={twMerge(
        "[container-type:size] absolute inset-0 flex items-center justify-center overflow-hidden rounded-[inherit] px-2",
        FAR_ONLY,
      )}
      style={{ background: `color-mix(in srgb, ${hue} 22%, var(--color-surface-800))` }}
    >
      {face.type === "picture" && <div className="size-full py-[14cqh]">{face.picture}</div>}
      {face.type === "value" && <PlateText text={face.text} height={height} mono />}
      {face.type === "title" && <PlateText text={title} height={height} mono={false} />}
    </div>
  );
}

/** Text at the plate's screen size, shrunk only where it would not fit its lines across. */
function PlateText({ text, height, mono }: { text: string; height: number; mono: boolean }) {
  const lines = height < TWO_LINE_HEIGHT ? 1 : 2;
  const fit = `${((lines * 100) / (Math.max(text.length, 4) * TEXT_ADVANCE)).toFixed(1)}cqw`;
  const tall = lines === 1 ? "64cqh" : "38cqh";

  return (
    <span
      className={twMerge(
        "text-center leading-tight font-semibold [overflow-wrap:anywhere] text-surface-50",
        mono && "font-mono font-medium",
        lines === 1 ? "line-clamp-1" : "line-clamp-2",
      )}
      style={{ fontSize: `min(${PLATE_TYPE}, ${fit}, ${tall})` }}
    >
      {text}
    </span>
  );
}

/** A title over a box's top edge under `FAR_ZOOM`, at `size` screen pixels, after `lead`. */
export function AbovePlate({
  title,
  size = 15,
  lead,
}: {
  title: string;
  size?: number;
  lead?: ReactNode;
}) {
  return (
    <span
      aria-hidden
      className={twMerge(
        "absolute bottom-full left-0 flex max-w-full items-center leading-tight font-semibold text-surface-100",
        FAR_ONLY,
      )}
      style={{
        fontSize: `calc(${size}px / var(--graph-zoom, 1))`,
        paddingBottom: "calc(6px / var(--graph-zoom, 1))",
        gap: "calc(6px / var(--graph-zoom, 1))",
      }}
    >
      {lead}
      <span className="min-w-0 truncate">{title}</span>
    </span>
  );
}

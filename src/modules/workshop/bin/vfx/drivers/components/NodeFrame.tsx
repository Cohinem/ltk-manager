import { type CSSProperties, type ReactNode } from "react";

import { twMerge } from "@/utils";

import type { GraphItem } from "../utils/graphItems";
import { itemHue } from "../utils/graphTones";
import { itemTitle } from "../utils/nodeText";
import { type PlateFace, plateFace } from "./PlateFace";

/**
 * The frame of every graph node, edged and washed in the item's hue.
 *
 * Under `FAR_ZOOM` its rows are too small to read, so a plate covers the node with its curve,
 * colour or value, or else its title, at a fixed screen size. A node whose body is a picture,
 * `plate="above"`, keeps the picture and sets the title over its top edge instead. An emitter
 * in a frame draws no plate, since the frame's title names it.
 */
export function NodeFrame({
  item,
  width,
  height,
  selected,
  dim = false,
  plate = "inside",
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
  children: ReactNode;
}) {
  const hue = itemHue(item);
  const style = {
    width,
    height,
    borderTopColor: hue,
    "--node-hue": hue,
    "--node-wash": `color-mix(in srgb, ${hue} 16%, transparent)`,
  } as CSSProperties;

  return (
    <div
      data-ui="SystemGraph:node"
      style={style}
      /* DS-GROUND, DS-RADIUS, DS-HOVER */
      className={twMerge(
        "group/node relative flex flex-col rounded-lg border border-t-2 border-surface-veil-strong bg-surface-800 text-row shadow-md transition-[border-color,box-shadow] hover:border-accent-hover",
        selected && "border-accent-500 ring-2 ring-accent-500/40 hover:border-accent-500",
        dim && "opacity-80",
      )}
    >
      {children}
      {plate === "inside" && (
        <InsidePlate title={itemTitle(item)} face={plateFace(item)} hue={hue} height={height} />
      )}
      {plate === "above" && <AbovePlate title={itemTitle(item)} />}
    </div>
  );
}

/** The zoom under which a node's rows give way to its plate. */
export const FAR_ZOOM = 0.6;

/** Classes of a part that shows only above `FAR_ZOOM`, keyed off `data-detail` on the canvas. */
export const NEAR_ONLY = "transition-opacity in-data-[detail=far]:opacity-0";
const FAR_ONLY =
  "pointer-events-none opacity-0 transition-opacity in-data-[detail=far]:pointer-events-auto in-data-[detail=far]:opacity-100";

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
      {face.type === "picture" && <div className="h-full w-full py-[14cqh]">{face.picture}</div>}
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

/** A title over a box's top edge under `FAR_ZOOM`, at `size` screen pixels. */
export function AbovePlate({ title, size = 15 }: { title: string; size?: number }) {
  return (
    <span
      aria-hidden
      className={twMerge(
        "absolute bottom-full left-0 max-w-full truncate leading-tight font-semibold text-surface-100",
        FAR_ONLY,
      )}
      style={{
        fontSize: `calc(${size}px / var(--graph-zoom, 1))`,
        paddingBottom: "calc(6px / var(--graph-zoom, 1))",
      }}
    >
      {title}
    </span>
  );
}

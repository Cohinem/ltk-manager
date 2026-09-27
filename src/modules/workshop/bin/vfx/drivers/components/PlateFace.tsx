import type { ReactNode } from "react";

import { twMerge } from "@/utils";

import { CHECKERBOARD } from "../../../../preview/components/ImagePreview";
import { plotOf } from "../../../curves/utils/curvePlot";
import { classFamily, colorCss, colorStops, gradientCss } from "../../../values/utils/valueRows";
import { isColorDriver } from "../../engine/drivers/registry";
import type { ValueCurve } from "../../engine/model/model";
import { CURVE_BOX, type CurveShape, curveShape } from "../utils/curveShape";
import type { GraphItem, ValueItem } from "../utils/graphItems";
import { formatValues } from "../utils/nodeText";
import { drawsRandom } from "../utils/valueRange";
import { CurveMarker, type MarkedFace, type MarkedShape } from "./CurveMarker";
import { CHANNEL_STROKE, RangePicture } from "./RangePicture";

/** What a far plate shows: a picture of the value, the value as text, or the title. */
export type PlateFace =
  | { readonly type: "picture"; readonly picture: ReactNode }
  | { readonly type: "value"; readonly text: string }
  | { readonly type: "title" };

const TITLE: PlateFace = { type: "title" };

/**
 * The face of an item's far plate: a curve's lines, a random value's span, a colour's band,
 * or a constant's value. Every other item keeps its title.
 */
export function plateFace(item: GraphItem): PlateFace {
  if (item.type === "value") {
    const shape = curveShape(item.curve, classFamily(item.classHash) === "color");
    if (shape === "keys" || shape === "tables") {
      return picture(<MarkedCurve item={item} shape={shape} face="far" />);
    }
    return curveFace(item.curve, shape === "band");
  }
  if (item.type !== "driver") return TITLE;

  const { node } = item;
  if (node.type === "curve") return curveFace(node.curve, isColorDriver(node.classHash));
  if (node.type !== "constant") return TITLE;
  if (isColorDriver(node.classHash)) return picture(<Band background={colorOf(node.value)} />);
  return { type: "value", text: formatValues(node.value) };
}

/** A colour's band, the lines of its keys or its random span, or else its one value. */
function curveFace(curve: ValueCurve, color: boolean): PlateFace {
  const shape = curveShape(curve, color);
  if (shape === null) {
    return { type: "value", text: formatValues(curve.keys[0]?.values ?? curve.constant) };
  }
  return picture(<CurvePicture curve={curve} shape={shape} />);
}

/**
 * A value node's curve, span or band with the run's marker over them. A span whose base holds
 * still has no time to mark, and a keyed span's marker is the line alone.
 */
export function MarkedCurve({
  item,
  shape,
  face = "near",
}: {
  item: ValueItem;
  shape: MarkedShape;
  face?: MarkedFace;
}) {
  let marker: Exclude<MarkedShape, "tables"> | null = shape === "tables" ? null : shape;
  if (shape === "keys" && drawsRandom(item.curve)) marker = "band";

  return (
    <div className="relative h-full w-full">
      <CurvePicture curve={item.curve} shape={shape} />
      {marker !== null && <CurveMarker item={item} shape={marker} face={face} />}
    </div>
  );
}

/** A curve drawn in the shape `curveShape` gives it, stretched to its box. */
export function CurvePicture({
  curve,
  shape,
}: {
  curve: ValueCurve;
  shape: Exclude<CurveShape, null>;
}) {
  const single = curve.constant.length === 1;

  switch (shape) {
    case "band": {
      const background =
        curve.keys.length > 0 ? gradientCss(colorStops(curve.keys)) : colorOf(curve.constant);
      return <Band background={background} />;
    }
    case "keys": {
      if (drawsRandom(curve)) return <RangePicture curve={curve} />;
      const plot = plotOf(curve.keys, CURVE_BOX);
      const lines = (plot?.lines ?? []).map((points, channel) => ({ points, channel }));
      return <Lines lines={lines} single={single} dashed={false} />;
    }
    case "tables":
      return <RangePicture curve={curve} />;
  }
}

function picture(node: ReactNode): PlateFace {
  return { type: "picture", picture: node };
}

function colorOf(values: readonly number[]): string {
  const css = colorCss([values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 1]);
  return `linear-gradient(${css}, ${css})`;
}

/** A colour or a gradient over the checkerboard, so an alpha reads as one. */
function Band({ background }: { background: string }) {
  return (
    <span
      /* DS-TOKEN, DS-RADIUS */
      className={twMerge(
        "block h-full w-full overflow-hidden rounded-md border border-surface-veil-strong [background-size:12px_12px]",
        CHECKERBOARD,
      )}
    >
      <span className="block h-full w-full" style={{ background }} />
    </span>
  );
}

interface LinesProps {
  lines: readonly { points: string; channel: number }[];
  /** The value has one channel, which draws in the node's hue. */
  single: boolean;
  /** The lines are probability tables, drawn against the chance rather than the time. */
  dashed: boolean;
}

function Lines({ lines, single, dashed }: LinesProps) {
  return (
    <svg
      viewBox={`0 0 ${CURVE_BOX.width} ${CURVE_BOX.height}`}
      preserveAspectRatio="none"
      className="block h-full w-full overflow-visible"
    >
      {lines.map(({ points, channel }) => (
        <polyline
          key={channel}
          points={points}
          fill="none"
          className={single ? undefined : CHANNEL_STROKE[channel]}
          stroke={single ? "var(--node-hue)" : undefined}
          strokeWidth={2.5}
          strokeDasharray={dashed ? "6 4" : undefined}
          strokeLinejoin="round"
          strokeLinecap="round"
          /* The box is stretched to the plate, so a scaled stroke would be an ellipse. */
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

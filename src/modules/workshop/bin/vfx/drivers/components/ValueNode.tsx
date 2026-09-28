import { DiceFiveIcon, WaveSineIcon } from "@phosphor-icons/react";
import type { NodeProps } from "@xyflow/react";
import { use, useMemo } from "react";

import { twMerge } from "@/utils";

import { ValueCell } from "../../../classes/components/ClassCells";
import { valueLines, valueShape } from "../utils/curveShape";
import { LINE_HEIGHT, VALUE_HEADER_HEIGHT } from "../utils/driverLayout";
import type { ValueItem } from "../utils/graphItems";
import { KIND_NAME, KIND_TONE } from "../utils/graphTones";
import { fieldAlias, itemSubtitle, valueSummary } from "../utils/nodeText";
import { outputTop } from "../utils/outputSocket";
import { FIELD_PAD, FieldBody, Line, NoteLine, useRowsAt } from "./FieldLines";
import { GraphActionsContext } from "./graphActions";
import { Output, RevealButton, type ValueFlowNode } from "./GraphNodes";
import { LiveValue } from "./LiveValue";
import { NEAR_ONLY, NodeFrame } from "./NodeFrame";
import { useCurveFollowsPick } from "./paneSync";
import { MarkedCurve } from "./PlateFace";
import { EmbedBackButton } from "./SocketEmbed";
import { CURVE_WELL } from "./ValueLine";

/**
 * A keyed or randomised value: its kind, summary and value at the playhead over its curve, or
 * over its row where it has no curve to draw. The socket it feeds names the field, so the node
 * names only its kind.
 */
export function ValueNodeView({ data, selected }: NodeProps<ValueFlowNode>) {
  const { item, width, height } = data.placed;

  return (
    <NodeFrame width={width} height={height} selected={selected} item={item}>
      <ValueHeader item={item} />
      <div className={FIELD_PAD}>
        <ValueBody item={item} />
      </div>
      <Output kind={item.kind} top={outputTop(item)} />
    </NodeFrame>
  );
}

function ValueHeader({ item }: { item: ValueItem }) {
  const actions = use(GraphActionsContext);
  const Glyph = item.curve.keys.length > 0 ? WaveSineIcon : DiceFiveIcon;
  const tone = item.kind === null ? "text-bin-class-text" : KIND_TONE[item.kind].text;
  const shape = valueShape(item);

  return (
    <div
      title={itemSubtitle(item)}
      className={twMerge(
        "flex shrink-0 items-center gap-1.5 rounded-t-[inherit] border-b border-surface-veil bg-linear-to-b from-(--node-wash) to-transparent px-2",
        NEAR_ONLY,
      )}
      style={{ height: VALUE_HEADER_HEIGHT }}
    >
      <Glyph weight="duotone" className={twMerge("h-4 w-4 shrink-0", tone)} />
      {item.kind !== null && (
        <span className={twMerge("shrink-0 text-meta", tone)}>{KIND_NAME[item.kind]}</span>
      )}
      <span className="min-w-0 flex-1 truncate text-meta text-surface-400">
        {valueSummary(item)}
      </span>
      <LiveValue item={item} />
      {shape === "tables" && (
        <span className={twMerge(CURVE_WELL, "h-5 w-28 shrink-0 px-1 py-0.5")}>
          <MarkedCurve item={item} shape={shape} />
        </span>
      )}
      <EmbedBackButton id={item.id} />
      {actions?.reveal && <RevealButton onReveal={() => actions.reveal?.(item.wire)} />}
    </div>
  );
}

/** A keyed value's curve or gradient beside its toggle, or any other value's editor. */
function ValueBody({ item }: { item: ValueItem }) {
  const rows = useRowsAt(item.holder, item.holderRows);
  const row = rows?.get(item.wire);
  const shown = useMemo(() => (row === undefined ? [] : [row]), [row]);
  useCurveFollowsPick(item.id, row);
  const shape = valueShape(item);
  const gradient = shape === "band" && item.curve.keys.length > 0;
  const keyed = shape === "keys" || gradient;

  return (
    <FieldBody wire={item.wire} rows={shown} read="curves">
      {row === undefined && <NoteLine label={fieldAlias(item.label)} />}
      {row !== undefined && keyed && (
        <div
          className="flex shrink-0 items-center gap-2 px-2"
          style={{ height: valueLines(item) * LINE_HEIGHT }}
        >
          <div className={twMerge(CURVE_WELL, "h-full min-w-0 flex-1 px-1.5 py-1")}>
            {gradient && <MarkedCurve item={item} shape="band" />}
            {!gradient && <MarkedCurve item={item} shape="keys" />}
          </div>
          <div className="flex shrink-0 items-center">
            <ValueCell row={row} shaped controls />
          </div>
        </div>
      )}
      {row !== undefined && !keyed && (
        <Line className="px-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <ValueCell row={row} shaped />
          </div>
        </Line>
      )}
    </FieldBody>
  );
}

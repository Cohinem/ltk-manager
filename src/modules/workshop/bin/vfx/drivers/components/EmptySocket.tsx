import { Handle, Position, useNodeId } from "@xyflow/react";
import { use, useEffect, useMemo } from "react";

import { m } from "@/i18n";
import type { BinRow } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { useRandomizer } from "../../../curves/components/RandomFields";
import {
  curveActivationEdits,
  curveDynamicsClass,
  CURVE_DYNAMICS,
} from "../../../curves/utils/curveEdits";
import { LeafEditContext } from "../../../tree/hooks/useLeafEdit";
import { rowKey } from "../../../tree/utils/binRows";
import { useValueMark } from "../../../values/hooks/useValueMarks";
import { QuickAddContext, type SocketPlug, socketKey } from "./graphActions";
import { SOCKET } from "./GraphNodes";

/** The prefix of an empty socket's handle id, which no edge ends at. */
export const EMPTY_SOCKET = "empty:";

/**
 * The input of a value row that holds a constant: a hollow socket that a drag out of, or a
 * click on, opens the quick add with what plugs in, a curve or a random range. Nothing draws
 * for a row that is no value, already has a curve, or takes no edit.
 */
export function EmptySocket({ row, label }: { row: BinRow; label: string }) {
  const quick = use(QuickAddContext);
  const node = useNodeId();
  const plug = useValuePlug(row, label);
  const id = `${EMPTY_SOCKET}${row.path}`;

  useEffect(() => {
    if (quick === null || node === null || plug === null) return;

    const key = socketKey(node, id);
    quick.plugs.set(key, plug);
    return () => {
      quick.plugs.delete(key);
    };
  }, [quick, node, id, plug]);

  if (quick === null || plug === null) return null;
  return (
    <Handle
      type="target"
      position={Position.Left}
      id={id}
      isConnectableEnd={false}
      title={m.workshop_bin_graph_socket_hint()}
      aria-label={plug.title}
      className={twMerge(
        SOCKET,
        "cursor-crosshair border-surface-400! bg-surface-800! opacity-60 hover:border-accent-400! hover:opacity-100",
      )}
      onClick={(event) => quick.open({ x: event.clientX, y: event.clientY }, plug)}
    />
  );
}

/** What plugs into a constant value: a flat curve at its level, or a random range around it. */
function useValuePlug(row: BinRow, label: string): SocketPlug | null {
  const mark = useValueMark(rowKey(row));
  const editProperty = use(LeafEditContext)?.editProperty;
  const randomizer = useRandomizer(row, mark);
  const valueClass = row.value.type === "struct" ? row.value.classHash : null;
  const constant = mark === undefined ? undefined : mark.constant;
  const curve = mark?.curve ?? true;

  return useMemo(() => {
    if (curve || editProperty === undefined || valueClass === null) return null;
    if (curveDynamicsClass(valueClass) === null) return null;

    const choices = [
      {
        key: "curve",
        text: m.workshop_bin_graph_plug_curve_action(),
        pick: () => {
          const edits = curveActivationEdits(valueClass, constant ?? null, "dynamics");
          if (edits !== null) void editProperty(row, CURVE_DYNAMICS, edits);
        },
      },
    ];
    if (randomizer !== null) {
      choices.push({
        key: "random",
        text: m.workshop_bin_graph_plug_random_action(),
        pick: () => void randomizer.start(),
      });
    }
    return {
      title: m.workshop_bin_graph_plug_title({ name: label }),
      sections: [{ title: label, choices }],
    };
  }, [curve, editProperty, valueClass, constant, randomizer, row, label]);
}

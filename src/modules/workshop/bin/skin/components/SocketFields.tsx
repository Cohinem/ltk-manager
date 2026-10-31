import { useMemo } from "react";

import { InputDefaultContext } from "@/components";
import type { BinRow, Socket } from "@/lib/tauri";

import { FieldRow } from "../../classes/components/ClassCells";
import { absentRow, type FieldSlot } from "../../vfx/inspector/components/StructFields";
import { defaultField } from "../../vfx/inspector/utils/emitterGroups";
import { useDynamicsEdit } from "../hooks/useDynamicsEdit";
import { FIELD } from "../utils/dynamicsFields";
import { dynamicsLabel } from "../utils/dynamicsLabels";
import { jointLabel } from "../utils/dynamicsModel";
import { socketParentEdits } from "../utils/socketEdits";
import { JointPicker } from "./JointPicker";
import { Fields, usePhysicsScope, ValueSlot } from "./PhysicsCells";

/** A row whose value is a name, in the interface's face where the fields around it are mono. */
const NAMED = "font-sans text-row";

export interface SocketFieldsProps {
  /** The socket's own row. */
  readonly row: BinRow;
  readonly socket: Socket;
}

/**
 * A socket's fields, with the joint it rides picked from the joints of the skeleton.
 *
 * "The physics pane" in docs/ux/SKIN_EDITOR.md.
 */
export function SocketFields({ row, socket }: SocketFieldsProps) {
  const special = (slot: FieldSlot) => {
    const { field, child, width, depth, owner } = slot;
    if (field.hash === FIELD.name && child !== undefined) {
      return (
        <div className={NAMED}>
          <FieldRow row={child} tableLayout width={width} depth={depth} owner={owner} />
        </div>
      );
    }
    if (field.hash !== FIELD.parentJoint || socket.kind !== "singleJoint") return undefined;

    return <ParentJoint slot={slot} socket={socket} />;
  };

  return <Fields row={row} special={special} />;
}

interface ParentJointProps {
  readonly slot: FieldSlot;
  readonly socket: Extract<Socket, { kind: "singleJoint" }>;
}

function ParentJoint({ slot, socket }: ParentJointProps) {
  const { field, child, holder, owner, width, depth } = slot;
  const { pose } = usePhysicsScope();
  const send = useDynamicsEdit(holder.entry);
  const joints = useMemo(() => pose.skeleton.joints.map((joint) => joint.name), [pose]);
  const row =
    child ??
    absentRow(holder, defaultField(field), { type: "hash", hash: "0x00000000", name: null });

  return (
    <InputDefaultContext value={child === undefined}>
      <FieldRow
        row={row}
        tableLayout
        width={width}
        depth={depth}
        owner={owner}
        valueSlot={
          <ValueSlot>
            <JointPicker
              label={dynamicsLabel(field.hash, field.name ?? undefined) ?? field.hash}
              joints={joints}
              value={jointLabel(pose, socket.parent)}
              disabled={send === null}
              onPick={(joint) => send?.(socketParentEdits(socket.path, joint))}
            />
          </ValueSlot>
        }
      />
    </InputDefaultContext>
  );
}

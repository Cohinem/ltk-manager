import { ArrowsClockwiseIcon, ArrowsOutCardinalIcon } from "@phosphor-icons/react";
import { use, useMemo } from "react";

import { IconButton, InputDefaultContext, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { BinRow, Socket } from "@/lib/tauri";

import { FieldRow } from "../../classes/components/ClassCells";
import { absentRow, type FieldSlot } from "../../vfx/inspector/components/StructFields";
import { defaultField } from "../../vfx/inspector/utils/emitterGroups";
import { useDynamicsEdit } from "../hooks/useDynamicsEdit";
import { SkinChoiceContext } from "../state/skinChoice";
import { FIELD } from "../utils/dynamicsFields";
import { dynamicsLabel } from "../utils/dynamicsLabels";
import { jointLabel } from "../utils/dynamicsModel";
import { socketParentEdits, socketTurns } from "../utils/socketEdits";
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

/** Whether the viewport's gizmo moves the picked socket or turns it. */
export function SocketGizmoMode({ socket }: { socket: Socket }) {
  const choice = use(SkinChoiceContext);
  if (choice === null || socket.kind === "other") return null;

  const turns = socketTurns(socket);
  const turn = (
    <IconButton
      size="row"
      pressed={turns && choice.socketMode === "rotate"}
      icon={<ArrowsClockwiseIcon />}
      label={m.workshop_bin_physics_socket_rotate_label()}
      tooltip={turns}
      disabled={!turns}
      onClick={() => choice.setSocketMode("rotate")}
    />
  );

  return (
    <>
      <IconButton
        size="row"
        pressed={!turns || choice.socketMode === "translate"}
        icon={<ArrowsOutCardinalIcon />}
        label={m.workshop_bin_physics_socket_move_label()}
        onClick={() => choice.setSocketMode("translate")}
      />
      {turns && turn}
      {!turns && (
        /* A disabled button takes no pointer, so the reason hangs on a span around it. */
        <Tooltip content={m.workshop_bin_physics_socket_rotate_none_hint()}>
          <span className="flex">{turn}</span>
        </Tooltip>
      )}
    </>
  );
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

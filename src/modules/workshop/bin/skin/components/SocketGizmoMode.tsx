import { ArrowsClockwiseIcon, ArrowsOutCardinalIcon, CubeFocusIcon } from "@phosphor-icons/react";
import { use } from "react";

import { IconButton, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { Socket } from "@/lib/tauri";
import { usePreviewMove, useSetPreviewDisplay } from "@/stores";

import { SkinChoiceContext } from "../state/skinChoice";
import { SOCKET_KEYS } from "../utils/skinKeys";
import { socketTurns } from "../utils/socketEdits";

/**
 * The buttons of the viewport's socket gizmo: move or turn, and which axes its handles run along.
 *
 * A press also takes the viewport's one gizmo from the unit's Move gizmo, which is why no button
 * reads as pressed while Move is on.
 */
export function SocketGizmoMode({ socket }: { socket: Socket }) {
  const choice = use(SkinChoiceContext);
  const move = usePreviewMove();
  const setDisplay = useSetPreviewDisplay();
  if (choice === null || socket.kind === "other") return null;

  const turns = socketTurns(socket);
  const take = () => setDisplay({ previewMove: false });
  const local = choice.socketSpace === "local";
  const turn = (
    <IconButton
      size="row"
      pressed={!move && turns && choice.socketMode === "rotate"}
      icon={<ArrowsClockwiseIcon />}
      label={m.workshop_bin_physics_socket_rotate_label({ key: SOCKET_KEYS.turn.shortcut })}
      tooltip={turns}
      disabled={!turns}
      onClick={() => {
        take();
        choice.setSocketMode("rotate");
      }}
    />
  );

  return (
    <>
      <IconButton
        size="row"
        pressed={!move && (!turns || choice.socketMode === "translate")}
        icon={<ArrowsOutCardinalIcon />}
        label={m.workshop_bin_physics_socket_move_label({ key: SOCKET_KEYS.move.shortcut })}
        onClick={() => {
          take();
          choice.setSocketMode("translate");
        }}
      />
      {turns && turn}
      {!turns && (
        /* A disabled button takes no pointer, so the reason hangs on a span around it. */
        <Tooltip content={m.workshop_bin_physics_socket_rotate_none_hint()}>
          <span className="flex">{turn}</span>
        </Tooltip>
      )}
      <IconButton
        size="row"
        pressed={local}
        icon={<CubeFocusIcon />}
        label={m.workshop_bin_map_tool_local_label({ key: SOCKET_KEYS.axes.shortcut })}
        onClick={() => {
          take();
          choice.setSocketSpace(local ? "world" : "local");
        }}
      />
    </>
  );
}

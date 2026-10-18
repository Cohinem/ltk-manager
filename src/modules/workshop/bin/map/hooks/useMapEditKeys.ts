import { type KeyboardEvent, useCallback } from "react";

import { type MapTool, useMapScene } from "../state/mapScene";
import { meshIndexOf, selectionMiddle } from "../utils/meshSelection";
import type { GeometryMeshes } from "./useGeometryMeshes";
import { useMeshActions } from "./useMeshActions";
import type { PlaceableActions } from "./usePlaceableActions";

/** The tool each plain key picks. Per "Keys" in docs/ux/MAP_EDITOR.md. */
const TOOL_KEYS: Readonly<Record<string, MapTool>> = {
  q: "select",
  w: "move",
  e: "rotate",
  r: "scale",
  p: "place",
};

/** Whether `target` takes typed text, where a plain key is a character. */
function typing(target: EventTarget): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.closest("input, textarea, select") !== null;
}

/**
 * Returns the viewport's key handler: the tool keys, X for the gizmo's axes, F to frame the
 * selection, H to hide it and Alt+H to show everything, End to drop the selected placeables onto
 * the floor under them, Delete, `Ctrl+D`, `F2`, `Ctrl+S`, the undo keys and Esc. Each edit key does nothing where the map takes no edits. Delete and
 * `Ctrl+D` act on meshes when the lead is a mesh.
 */
export function useMapEditKeys(
  actions: PlaceableActions,
  geometry: GeometryMeshes,
  drop?: () => void,
) {
  const { setTool, setRenaming, select, lead } = useMapScene();
  const { stepHistory, stepsHistory, saveGeometry } = useMapScene();
  const { selected, hidden, setHidden, focusOn, space, setSpace } = useMapScene();
  const { editable, remove, duplicate } = actions;
  const meshActions = useMeshActions(geometry.meshes.length);
  const meshLead = lead !== null && meshIndexOf(lead) !== null;
  const { selection } = geometry;

  const removeMeshes = useCallback(
    () => meshActions.remove(selection.map((mesh) => mesh.index)),
    [meshActions, selection],
  );
  const duplicateMeshes = useCallback(
    () => meshActions.duplicate(selection.map((mesh) => mesh.index)),
    [meshActions, selection],
  );

  return useCallback(
    (event: KeyboardEvent) => {
      if (typing(event.target)) return;

      const command = event.ctrlKey || event.metaKey;
      const plain = !command && !event.altKey;
      const key = event.key.toLowerCase();
      const tool = plain ? TOOL_KEYS[key] : undefined;
      if (tool !== undefined && editable) {
        event.preventDefault();
        setTool(tool);
        return;
      }

      if (event.key === "Escape" && plain) {
        select([], "replace");
        return;
      }

      if (key === "f" && plain) {
        const middle = selectionMiddle(actions.selection, selection);
        if (middle !== null) {
          event.preventDefault();
          focusOn({ id: `frame:${[...selected].join(",")}`, position: middle });
        }
        return;
      }
      if (key === "h" && !command) {
        event.preventDefault();
        if (event.altKey) setHidden([...hidden], false);
        else if (selected.size > 0) setHidden([...selected], true);
        return;
      }
      if (key === "x" && plain && editable) {
        event.preventDefault();
        setSpace(space === "world" ? "local" : "world");
        return;
      }

      if (!editable) return;

      /* The shell steps the edits it recorded in the order they were made, across both
         files. The tab's own history takes an undo past them. */
      const undo = command && key === "z" && !event.shiftKey;
      const redo = command && (key === "y" || (key === "z" && event.shiftKey));
      if ((undo || redo) && stepsHistory(undo)) {
        event.preventDefault();
        event.stopPropagation();
        void stepHistory(undo);
        return;
      }

      if (command && key === "s") {
        event.preventDefault();
        void saveGeometry();
      } else if (event.key === "Delete" && plain) {
        event.preventDefault();
        void (meshLead ? removeMeshes() : remove());
      } else if (command && key === "d") {
        event.preventDefault();
        void (meshLead ? duplicateMeshes() : duplicate());
      } else if (event.key === "End" && plain && !meshLead && drop !== undefined) {
        event.preventDefault();
        drop();
      } else if (event.key === "F2" && plain && actions.lead !== null) {
        event.preventDefault();
        setRenaming(true);
      }
    },
    [
      editable,
      meshLead,
      actions.lead,
      remove,
      duplicate,
      removeMeshes,
      duplicateMeshes,
      drop,
      setTool,
      setRenaming,
      select,
      stepHistory,
      stepsHistory,
      saveGeometry,
      actions.selection,
      selection,
      selected,
      hidden,
      setHidden,
      focusOn,
      space,
      setSpace,
    ],
  );
}

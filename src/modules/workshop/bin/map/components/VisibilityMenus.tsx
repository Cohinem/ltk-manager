import { CubeIcon, MapPinIcon, PencilSimpleIcon, SelectionIcon } from "@phosphor-icons/react";

import { ContextMenu } from "@/components";
import { m } from "@/i18n";
import type { MapController } from "@/lib/tauri";

import type { VisibilityAuthoring } from "../hooks/useVisibilityAuthoring";

export interface ControllerMenuProps {
  readonly controller: MapController;
  readonly authoring: VisibilityAuthoring;
  /** Opens the parents of a child controller for editing. */
  readonly onEditParents: (controller: MapController) => void;
}

/** The menu of a controller row in the Visibility pane. */
export function ControllerMenu({ controller, authoring, onEditParents }: ControllerMenuProps) {
  const { hash } = controller;

  return (
    <ContextMenu.Content className="w-60">
      <ContextMenu.Item icon={<CubeIcon />} onClick={() => authoring.selectMeshes(hash)}>
        {m.workshop_bin_map_visibility_select_meshes_action()}
      </ContextMenu.Item>
      <ContextMenu.Item icon={<MapPinIcon />} onClick={() => authoring.selectPlaceables(hash)}>
        {m.workshop_bin_map_visibility_select_placeables_action()}
      </ContextMenu.Item>
      <ContextMenu.Item icon={<SelectionIcon />} onClick={() => authoring.isolate(hash)}>
        {m.workshop_bin_map_visibility_isolate_action()}
      </ContextMenu.Item>
      {controller.rule.kind === "child" && (
        <>
          <ContextMenu.Separator />
          <ContextMenu.Item
            icon={<PencilSimpleIcon />}
            disabled={!authoring.editable}
            onClick={() => onEditParents(controller)}
          >
            {m.workshop_bin_map_visibility_parents_action()}
          </ContextMenu.Item>
        </>
      )}
    </ContextMenu.Content>
  );
}

/** The menu of a layer row in the Visibility pane. */
export function LayerMenu({ index, authoring }: { index: number; authoring: VisibilityAuthoring }) {
  return (
    <ContextMenu.Content className="w-60">
      <ContextMenu.Item icon={<CubeIcon />} onClick={() => authoring.selectLayer(index)}>
        {m.workshop_bin_map_visibility_select_meshes_action()}
      </ContextMenu.Item>
    </ContextMenu.Content>
  );
}

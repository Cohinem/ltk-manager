import {
  CubeIcon,
  type Icon,
  MapPinIcon,
  PencilSimpleIcon,
  SelectionIcon,
} from "@phosphor-icons/react";
import { Fragment } from "react";

import { ContextMenu, Menu } from "@/components";
import { m } from "@/i18n";
import type { MapController } from "@/lib/tauri";

import { useVisibilityAuthoring, type VisibilityAuthoring } from "../hooks/useVisibilityAuthoring";
import { useMapScene } from "../state/mapScene";
import { controllerLabel } from "../utils/mapControllers";

export interface ControllerMenuProps {
  readonly controller: MapController;
  readonly authoring: VisibilityAuthoring;
  /** Opens the parents of a child controller for editing. */
  readonly onEditParents: (controller: MapController) => void;
}

const PARENTS_ACTION = "parents";

/** One action of a controller, as the row menu and the menu bar list it. */
interface ControllerAction {
  readonly id: string;
  readonly icon: Icon;
  readonly label: string;
  readonly disabled: boolean;
  readonly run: () => void;
}

/** Returns the actions of `controller`. Only a child controller has parents to edit. */
function controllerActions({
  controller,
  authoring,
  onEditParents,
}: ControllerMenuProps): ControllerAction[] {
  const { hash } = controller;
  const actions: ControllerAction[] = [
    {
      id: "meshes",
      icon: CubeIcon,
      label: m.workshop_bin_map_visibility_select_meshes_action(),
      disabled: false,
      run: () => authoring.selectMeshes(hash),
    },
    {
      id: "placeables",
      icon: MapPinIcon,
      label: m.workshop_bin_map_visibility_select_placeables_action(),
      disabled: false,
      run: () => authoring.selectPlaceables(hash),
    },
    {
      id: "isolate",
      icon: SelectionIcon,
      label: m.workshop_bin_map_visibility_isolate_action(),
      disabled: false,
      run: () => authoring.isolate(hash),
    },
  ];

  if (controller.rule.kind === "child") {
    actions.push({
      id: PARENTS_ACTION,
      icon: PencilSimpleIcon,
      label: m.workshop_bin_map_visibility_parents_action(),
      disabled: !authoring.editable,
      run: () => onEditParents(controller),
    });
  }

  return actions;
}

/** The menu of a controller row in the Visibility pane. */
export function ControllerMenu(props: ControllerMenuProps) {
  return (
    <ContextMenu.Content className="w-60">
      {controllerActions(props).map(({ id, icon: Glyph, label, disabled, run }) => (
        <Fragment key={id}>
          {id === PARENTS_ACTION && <ContextMenu.Separator />}
          <ContextMenu.Item icon={<Glyph />} disabled={disabled} onClick={run}>
            {label}
          </ContextMenu.Item>
        </Fragment>
      ))}
    </ContextMenu.Content>
  );
}

/**
 * The scene's visibility controllers as submenu items of the menu bar.
 *
 * A slot rather than data, so a map's many controllers do not list four palette commands each.
 */
export function ControllerBarItems({
  onEditParents,
}: {
  onEditParents: ControllerMenuProps["onEditParents"];
}) {
  const { backdrop } = useMapScene();
  const authoring = useVisibilityAuthoring();

  return backdrop.controllers.map((controller) => (
    <Menu.SubmenuRoot key={controller.hash}>
      <Menu.SubmenuTrigger>{controllerLabel(controller)}</Menu.SubmenuTrigger>
      <Menu.SubmenuContent className="w-60">
        {controllerActions({ controller, authoring, onEditParents }).map(
          ({ id, icon: Glyph, label, disabled, run }) => (
            <Menu.Item
              key={id}
              icon={<Glyph className="size-4" />}
              disabled={disabled}
              onClick={run}
            >
              {label}
            </Menu.Item>
          ),
        )}
      </Menu.SubmenuContent>
    </Menu.SubmenuRoot>
  ));
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

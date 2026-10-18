import { ArrowCounterClockwiseIcon, PlusIcon } from "@phosphor-icons/react";
import { type MouseEvent, useMemo, useState } from "react";

import { IconButton, Inline } from "@/components";
import { m } from "@/i18n";
import type { MapController } from "@/lib/tauri";

import { objectDocument } from "../../../documents/utils/contentDocument";
import { clickIntent, useOpenDocumentAs } from "../../../state";
import { useVisibilityAuthoring } from "../hooks/useVisibilityAuthoring";
import { useMapScene } from "../state/mapScene";
import { BackdropVisibilityList, type VisibilityListAuthoring } from "./BackdropVisibilityList";
import { NewControllerDialog, ParentsDialog } from "./ControllerDialogs";
import { ControllerMenu, LayerMenu } from "./VisibilityMenus";

/**
 * The Visibility pane of a map: the layers and the visibility controllers of the map in
 * view, read from the `MapSceneHost` above it.
 *
 * A change here changes what the map's preview draws. The reset returns to the map's
 * opening flags and removes every override. A controller row opens the controller object
 * in its own tab, where its fields are edited. A right click on a row selects or isolates
 * what it shows, and a drop of the outliner's selection on a controller row assigns that
 * controller. New controller and the parents of a child controller edit the map while it
 * takes edits. Per "Visibility" in docs/ux/MAP_EDITOR.md. The pane scrolls as one list.
 */
export function MapVisibilityPane() {
  const { backdrop, materialsAsset, chosen } = useMapScene();
  const authoring = useVisibilityAuthoring();
  const open = useOpenDocumentAs();
  const [creating, setCreating] = useState(false);
  const [parentsOf, setParentsOf] = useState<MapController | null>(null);

  const openController = (hash: string, event: MouseEvent) => {
    if (materialsAsset === null || chosen === null) return;

    const file = `${chosen.map}.materials.bin`;
    open(objectDocument(materialsAsset, hash, hash, file), clickIntent(event));
  };

  const listAuthoring = useMemo<VisibilityListAuthoring>(
    () => ({
      controllerMenu: (controller) => (
        <ControllerMenu
          controller={controller}
          authoring={authoring}
          onEditParents={setParentsOf}
        />
      ),
      layerMenu: (index) => <LayerMenu index={index} authoring={authoring} />,
      onDrop: authoring.editable ? (hash) => void authoring.assign(hash) : null,
    }),
    [authoring],
  );

  return (
    /* DS-SCROLLBAR */
    <div
      data-ui="MapVisibilityPane"
      className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 scrollbar-md select-none"
    >
      <Inline gap={2} justify="between">
        <p className="min-w-0 text-meta text-surface-400">
          {m.workshop_bin_preview_backdrop_visibility_description()}
        </p>
        <Inline gap={1}>
          {authoring.editable && (
            <IconButton
              icon={<PlusIcon weight="bold" />}
              onClick={() => setCreating(true)}
              label={m.workshop_bin_map_visibility_new_action()}
            />
          )}
          <IconButton
            icon={<ArrowCounterClockwiseIcon />}
            disabled={!backdrop.customized}
            onClick={backdrop.reset}
            label={m.workshop_bin_preview_backdrop_visibility_reset_action()}
          />
        </Inline>
      </Inline>
      <BackdropVisibilityList
        backdrop={backdrop}
        onOpenController={materialsAsset === null ? undefined : openController}
        authoring={listAuthoring}
      />
      {creating && <NewControllerDialog onClose={() => setCreating(false)} />}
      {parentsOf !== null && (
        <ParentsDialog controller={parentsOf} onClose={() => setParentsOf(null)} />
      )}
    </div>
  );
}

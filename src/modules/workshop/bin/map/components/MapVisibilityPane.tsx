import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import type { MouseEvent } from "react";

import { IconButton, Inline } from "@/components";
import { m } from "@/i18n";

import { objectDocument } from "../../../documents/utils/contentDocument";
import { clickIntent, useOpenDocumentAs } from "../../../state";
import { useMapScene } from "../state/mapScene";
import { BackdropVisibilityList } from "./BackdropVisibilityList";

/**
 * The Visibility pane of a map: the layers and the visibility controllers of the map in
 * view, read from the `MapSceneHost` above it.
 *
 * A change here changes what the map's preview draws. The reset returns to the map's
 * opening flags and removes every override. A controller row opens the controller object
 * in its own tab, where its fields are edited. The pane scrolls as one list.
 */
export function MapVisibilityPane() {
  const { backdrop, materialsAsset, chosen } = useMapScene();
  const open = useOpenDocumentAs();

  const openController = (hash: string, event: MouseEvent) => {
    if (materialsAsset === null || chosen === null) return;

    const file = `${chosen.map}.materials.bin`;
    open(objectDocument(materialsAsset, hash, hash, file), clickIntent(event));
  };

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
        <IconButton
          icon={<ArrowCounterClockwiseIcon />}
          disabled={!backdrop.customized}
          onClick={backdrop.reset}
          label={m.workshop_bin_preview_backdrop_visibility_reset_action()}
        />
      </Inline>
      <BackdropVisibilityList
        backdrop={backdrop}
        onOpenController={materialsAsset === null ? undefined : openController}
      />
    </div>
  );
}

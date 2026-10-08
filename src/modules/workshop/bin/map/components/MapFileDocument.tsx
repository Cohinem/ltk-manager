import { type ReactNode, useEffect, useMemo, useState } from "react";

import { SegmentedControl } from "@/components";
import { m } from "@/i18n";
import type { MapPath } from "@/lib/tauri";
import { DocumentToolbar } from "@/modules/editor";

import { CollapseAllButton } from "../../../shared/components/CollapseAllButton";
import { MapSceneHost, type MapSceneSource } from "../state/mapScene";
import { MapOutliner } from "./MapOutliner";
import { MapPreview, preloadMapViewport } from "./MapPreview";
import { MapVisibilityPane } from "./MapVisibilityPane";

/** What a map file's tab shows: the drawn map, or the objects its bin declares. */
type MapFileView = "map" | "objects";

/** What the panel beside the drawn map lists: the chunk graph, or the layers and controllers. */
type MapFileSide = "outliner" | "visibility";

export interface MapFileDocumentProps {
  /** The map that file belongs to. */
  readonly map: MapPath;
  readonly active: boolean;
  /** The preview tab's own actions, drawn after the switch. */
  readonly actions: ReactNode;
  /**
   * The file as its objects, handed the switch to draw among its own actions, and absent
   * for a `.mapgeo`, which declares none.
   */
  readonly objects?: (actions: ReactNode) => ReactNode;
}

/**
 * One file of a map, opened on the map it draws.
 *
 * A `.materials.bin` keeps its objects a switch away, since the map is what a reader of
 * either file came for and the objects of the bin are where they edit it.
 */
export function MapFileDocument({ map, active, actions, objects }: MapFileDocumentProps) {
  const [view, setView] = useState<MapFileView>("map");
  const [collapseAllSignal, setCollapseAllSignal] = useState(0);
  useEffect(preloadMapViewport, []);

  const viewSwitch = objects !== undefined && (
    <SegmentedControl
      size="sm"
      aria-label={m.workshop_bin_map_file_view_label()}
      value={view}
      onChange={setView}
      options={[
        { value: "map", label: m.workshop_bin_layout_map_label() },
        { value: "objects", label: m.workshop_bin_map_file_objects_label() },
      ]}
    />
  );

  if (view === "objects" && objects !== undefined) {
    return objects(
      <>
        {viewSwitch}
        {actions}
      </>,
    );
  }

  return (
    <>
      <DocumentToolbar active={active}>
        {viewSwitch}
        <CollapseAllButton onCollapse={() => setCollapseAllSignal((count) => count + 1)} />
        {actions}
      </DocumentToolbar>
      <MapFileScene map={map} collapseAllSignal={collapseAllSignal} />
    </>
  );
}

interface MapFileSceneProps {
  readonly map: MapPath;
  /** A count the toolbar's collapse-all button raises. */
  readonly collapseAllSignal: number;
}

/**
 * The map beside a panel that switches between its chunk graph and its visibility, which is
 * the map shell without an object to inspect.
 */
function MapFileScene({ map, collapseAllSignal }: MapFileSceneProps) {
  const source = useMemo<MapSceneSource>(() => ({ kind: "file", map }), [map]);
  const [side, setSide] = useState<MapFileSide>("outliner");

  return (
    <MapSceneHost source={source}>
      <div data-ui="MapFileDocument" className="flex min-h-0 flex-1 bg-surface-950">
        <MapPreview document={null} />
        <div className="flex w-80 shrink-0 flex-col border-l border-surface-700/50">
          <div className="flex shrink-0 justify-center border-b border-surface-700/50 p-1.5">
            <SegmentedControl
              size="sm"
              aria-label={m.workshop_bin_map_file_side_label()}
              value={side}
              onChange={setSide}
              options={[
                { value: "outliner", label: m.workshop_bin_pane_outliner_label() },
                { value: "visibility", label: m.workshop_bin_pane_visibility_label() },
              ]}
            />
          </div>
          {side === "outliner" && <MapOutliner collapseAllSignal={collapseAllSignal} />}
          {side === "visibility" && <MapVisibilityPane />}
        </div>
      </div>
    </MapSceneHost>
  );
}

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { SegmentedControl } from "@/components";
import { m } from "@/i18n";
import type { MapPath } from "@/lib/tauri";
import { DocumentToolbar, useDocumentHistory } from "@/modules/editor";

import { CollapseAllButton } from "../../../shared/components/CollapseAllButton";
import { createPaneCommandHub, PaneCommandsContext } from "../../menus/state/paneCommands";
import { typing } from "../hooks/useMapEditKeys";
import { useMapTabSave } from "../hooks/useMapTabSave";
import { MapSceneHost, type MapSceneSource, useMapScene } from "../state/mapScene";
import { MapFileMenubar } from "./MapFileMenubar";
import { MapOutliner } from "./MapOutliner";
import { MapPreview, preloadMapViewport } from "./MapPreview";
import { MapVisibilityPane } from "./MapVisibilityPane";

/** What a map file's tab shows: the drawn map, or the objects its bin declares. */
type MapFileView = "map" | "objects";

/** What the panel beside the drawn map lists: the chunk graph, or the layers and controllers. */
type MapFileSide = "outliner" | "visibility";

export interface MapFileDocumentProps {
  /** The editor's id for the tab, which the save, the history and the palette are keyed on. */
  readonly documentId: string;
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
export function MapFileDocument({
  documentId,
  map,
  active,
  actions,
  objects,
}: MapFileDocumentProps) {
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
    <MapFileScene
      documentId={documentId}
      map={map}
      active={active}
      collapseAllSignal={collapseAllSignal}
      toolbar={
        <>
          {viewSwitch}
          <CollapseAllButton onCollapse={() => setCollapseAllSignal((count) => count + 1)} />
          {actions}
        </>
      }
    />
  );
}

interface MapFileSceneProps {
  readonly documentId: string;
  readonly map: MapPath;
  readonly active: boolean;
  /** A count the toolbar's collapse-all button raises. */
  readonly collapseAllSignal: number;
  /** What the toolbar draws after the menu bar. */
  readonly toolbar: ReactNode;
}

/**
 * The map beside a panel that switches between its chunk graph and its visibility, which is
 * the map shell without an object to inspect. The toolbar sits under the scene host, because its
 * menu bar reads the scene.
 */
function MapFileScene({ map, ...rest }: MapFileSceneProps) {
  const source = useMemo<MapSceneSource>(() => ({ kind: "file", map }), [map]);
  const [paneCommands] = useState(createPaneCommandHub);

  return (
    <MapSceneHost source={source}>
      <PaneCommandsContext value={paneCommands}>
        <MapFileBody {...rest} />
      </PaneCommandsContext>
    </MapSceneHost>
  );
}

function MapFileBody({
  documentId,
  active,
  collapseAllSignal,
  toolbar,
}: Omit<MapFileSceneProps, "map">) {
  const { editable, stepHistory } = useMapScene();
  const [side, setSide] = useState<MapFileSide>("outliner");
  const root = useRef<HTMLDivElement>(null);

  useMapTabSave(documentId);
  useDocumentHistory(
    documentId,
    (step, target) => {
      if (typing(target)) return false;

      void stepHistory(step === "undo");
      return true;
    },
    editable,
  );

  return (
    <>
      <DocumentToolbar active={active}>
        <MapFileMenubar documentId={documentId} keyScope={root} />
        {toolbar}
      </DocumentToolbar>
      <div
        ref={root}
        data-ui="MapFileDocument"
        tabIndex={-1}
        className="flex min-h-0 flex-1 bg-surface-950 outline-none"
      >
        <MapPreview document={null} />
        <div className="flex w-80 shrink-0 flex-col border-l border-surface-700/50">
          <div className="flex shrink-0 justify-center border-b border-surface-700/50 p-1.5">
            <SegmentedControl
              size="sm"
              aria-label={m.workshop_bin_map_file_side_label()}
              value={side}
              onChange={setSide}
              options={[
                {
                  value: "outliner",
                  label: m.workshop_bin_pane_outliner_label(),
                },
                {
                  value: "visibility",
                  label: m.workshop_bin_pane_visibility_label(),
                },
              ]}
            />
          </div>
          {side === "outliner" && <MapOutliner collapseAllSignal={collapseAllSignal} />}
          {side === "visibility" && <MapVisibilityPane />}
        </div>
      </div>
    </>
  );
}

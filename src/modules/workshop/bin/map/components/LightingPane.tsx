import { CubeTransparentIcon, PlusCircleIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { Button, Disclosure, IconButton } from "@/components";
import { m } from "@/i18n";

import { mapQueries } from "../api/mapQueries";
import { useMapScene } from "../state/mapScene";
import { NO_FILTER, placedItems } from "../utils/mapOutline";
import { LIGHTING_SECTIONS } from "../utils/mapSettings";
import { SettingsSections, type TabBin } from "./SettingsSections";

/** The class that the lighting volumes section lists and places. */
const LIGHTING_VOLUME = "MapLightingVolume";

/** The sections above the lighting volumes, which the spec lists after dynamic lighting. */
const VOLUMES_AFTER = LIGHTING_SECTIONS.findIndex((section) => section.id === "dynamic") + 1;

/** The section whose open state shows the sun handle in the viewport. */
const SUN_SECTION = "sun";

export interface LightingPaneProps {
  readonly tab: TabBin;
  /** The pane is the front tab of its panel, where a reader sees it. */
  readonly shown: boolean;
  readonly objectName: (entry: string) => string;
  readonly onNotOpen: () => void;
}

/**
 * The Lighting pane of a map: the container's lighting components and the look of the skin in
 * view, as folding sections, and the map's lighting volumes. While the pane is shown with its
 * Sun section open, the viewport draws the sun direction handle.
 *
 * Per "Lighting" in docs/ux/MAP_EDITOR.md.
 */
export function LightingPane({ tab, shown, objectName, onNotOpen }: LightingPaneProps) {
  const { editable, setSunHandle } = useMapScene();
  const [sunOpen, setSunOpen] = useState(true);
  const shared = { tab, objectName, onNotOpen };

  useEffect(() => {
    setSunHandle(editable && shown && sunOpen);
    return () => setSunHandle(false);
  }, [editable, shown, sunOpen, setSunHandle]);

  return (
    /* DS-SCROLLBAR */
    <div
      data-ui="LightingPane"
      className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2 scrollbar-md"
    >
      <SettingsSections
        {...shared}
        sections={LIGHTING_SECTIONS.slice(0, VOLUMES_AFTER)}
        opened={[SUN_SECTION]}
        onOpenChange={(id, open) => {
          if (id === SUN_SECTION) setSunOpen(open);
        }}
      />
      <LightingVolumes />
      <SettingsSections {...shared} sections={LIGHTING_SECTIONS.slice(VOLUMES_AFTER)} />
    </div>
  );
}

/** The map's lighting volumes as rows that select one, and a button that places a new one. */
function LightingVolumes() {
  const { materials, editable, select, focusOn, setPlaceClass, setTool, selected } = useMapScene();
  const outline = useQuery(mapQueries.outline(materials)).data;
  const volumes = useMemo(
    () =>
      placedItems(outline ?? [], NO_FILTER).filter(({ item }) => item.class === LIGHTING_VOLUME),
    [outline],
  );

  const place = editable && (
    <IconButton
      icon={<PlusCircleIcon />}
      onClick={() => {
        setPlaceClass(LIGHTING_VOLUME);
        setTool("place");
      }}
      label={m.workshop_bin_map_lighting_volumes_place_action()}
    />
  );

  if (volumes.length === 0) {
    return (
      <div className="flex min-w-0 items-center gap-1 px-1">
        <span className="min-w-0 flex-1 truncate py-1 pl-5 text-row text-surface-400">
          {m.workshop_bin_map_lighting_volumes_label()}
        </span>
        {place}
      </div>
    );
  }

  return (
    <Disclosure.Root>
      <div className="flex min-w-0 items-center gap-1 px-1">
        <Disclosure.Trigger className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm py-1 text-row text-surface-100">
          <Disclosure.Caret />
          <span className="truncate">{m.workshop_bin_map_lighting_volumes_label()}</span>
        </Disclosure.Trigger>
        {place}
      </div>
      <Disclosure.Panel className="flex flex-col pb-2">
        {volumes.map(({ id, item }) => (
          <Button
            key={id}
            variant="ghost"
            size="sm"
            aria-pressed={selected.has(id)}
            left={<CubeTransparentIcon />}
            className="justify-start"
            onClick={() => {
              select([id], "replace");
              const [x = 0, y = 0, z = 0] = item.position;
              focusOn({ id: `volume:${id}`, position: [x ?? 0, y ?? 0, z ?? 0] });
            }}
          >
            {item.name}
          </Button>
        ))}
      </Disclosure.Panel>
    </Disclosure.Root>
  );
}

import { CaretDownIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";

import { Button, Menu } from "@/components";
import { m } from "@/i18n";

import { mapQueries } from "../api/mapQueries";
import { useMapScene } from "../state/mapScene";
import { chunkLabel } from "../utils/mapOutline";

/** The classes the Place tool adds, grouped as the palette groups them. */
const GROUPS: readonly { label: () => string; classes: readonly string[] }[] = [
  { label: m.workshop_bin_map_place_effects_label, classes: ["MapParticle"] },
  { label: m.workshop_bin_map_place_audio_label, classes: ["MapAudio"] },
  {
    label: m.workshop_bin_map_place_lighting_label,
    classes: [
      "MapDynamicPointLight",
      "MapDynamicSpotlight",
      "MapPointLight",
      "MapSpotlight",
      "MapUniquePointLight",
      "MapCubemapProbe",
      "MapLightingVolume",
    ],
  },
  {
    label: m.workshop_bin_map_place_markers_label,
    classes: ["MapLocator", "MapMotionPath"],
  },
];

/** The value the target radio group holds for the chunk of the selection. */
const SELECTION_CHUNK = "";

/**
 * The class the Place tool adds and the chunk it adds to. Per "Place" in
 * docs/ux/MAP_EDITOR.md.
 */
export function PlaceMenu() {
  const { materials, placeClass, setPlaceClass, target, setTarget } = useMapScene();
  const chunks = useQuery(mapQueries.outline(materials)).data ?? [];

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            variant="ghost"
            size="xs"
            aria-label={m.workshop_bin_map_place_class_label()}
            right={<CaretDownIcon weight="bold" className="size-3" />}
          >
            {placeClass}
          </Button>
        }
      />
      <Menu.Content
        align="start"
        data-ui="PlaceMenu"
        className="max-h-96 w-64 overflow-y-auto scrollbar-md"
      >
        <Menu.RadioGroup value={placeClass} onValueChange={(value) => setPlaceClass(String(value))}>
          {GROUPS.map((group) => (
            <Menu.Group key={group.label()}>
              <Menu.GroupLabel>{group.label()}</Menu.GroupLabel>
              {group.classes.map((each) => (
                <Menu.RadioItem key={each} value={each}>
                  {each}
                </Menu.RadioItem>
              ))}
            </Menu.Group>
          ))}
        </Menu.RadioGroup>
        <Menu.Separator />
        <Menu.Group>
          <Menu.GroupLabel>{m.workshop_bin_map_place_target_label()}</Menu.GroupLabel>
          <Menu.RadioGroup
            value={target ?? SELECTION_CHUNK}
            onValueChange={(value) => setTarget(value === SELECTION_CHUNK ? null : String(value))}
          >
            <Menu.RadioItem value={SELECTION_CHUNK}>
              {m.workshop_bin_map_place_target_selection_label()}
            </Menu.RadioItem>
            {chunks.map((chunk) => (
              <Menu.RadioItem key={chunk.entry} value={chunk.entry}>
                {chunkLabel(chunk)}
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu.Group>
      </Menu.Content>
    </Menu.Root>
  );
}

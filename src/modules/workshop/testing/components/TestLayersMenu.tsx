import { CaretDownIcon } from "@phosphor-icons/react";

import { IconButton, Menu } from "@/components";
import { m } from "@/i18n";
import type { WorkshopProject } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { testedLayers, useExcludedTestLayers, useToggleTestLayer } from "../state/testLayers";

interface TestLayersMenuProps {
  project: WorkshopProject;
  className?: string;
}

/**
 * The layers a test of a project turns on, as a checklist under the caret beside Test.
 *
 * Draws nothing for a project with only `base`, which is always on. The caret carries a
 * `tested/total` count while a layer is left out, so a partial test reads before it starts.
 */
export function TestLayersMenu({ project, className }: TestLayersMenuProps) {
  const excluded = useExcludedTestLayers(project.path);
  const toggleLayer = useToggleTestLayer();

  if (project.layers.length < 2) return null;

  const layers = [...project.layers].sort((a, b) => a.priority - b.priority);
  const tested = testedLayers(project.layers, excluded);

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <IconButton
            data-ui="TestLayersMenu"
            icon={
              <span className="flex items-center gap-1">
                {tested && (
                  <span className="text-xs font-medium tabular-nums">
                    {m.workshop_test_layers_count_label({
                      tested: tested.length,
                      total: layers.length,
                    })}
                  </span>
                )}
                <CaretDownIcon weight="bold" className="h-3.5 w-3.5" />
              </span>
            }
            variant="ghost"
            size="sm"
            aria-label={m.workshop_test_layers_label()}
            className={twMerge("w-auto px-1.5", className)}
          />
        }
      />
      <Menu.Portal>
        <Menu.Positioner align="end">
          <Menu.Popup className="w-56">
            <Menu.Group>
              <Menu.GroupLabel>{m.workshop_test_layers_title()}</Menu.GroupLabel>
              {layers.map((layer) => {
                const isBase = layer.name === "base";

                return (
                  <Menu.CheckboxItem
                    key={layer.name}
                    checked={isBase || !excluded.includes(layer.name)}
                    disabled={isBase}
                    onCheckedChange={() => toggleLayer(project.path, layer.name)}
                  >
                    {layer.displayName || layer.name}
                  </Menu.CheckboxItem>
                );
              })}
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

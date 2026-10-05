import { Layers } from "lucide-react";

import { Button, Popover } from "@/components";
import type { InstalledMod } from "@/lib/tauri";
import { useSetModLayers } from "@/modules/library/api";

import { LayerToggleList } from "./LayerToggleList";

interface LayerPopoverProps {
  mod: InstalledMod;
  disabled?: boolean;
}

export function LayerPopover({ mod, disabled }: LayerPopoverProps) {
  const setModLayers = useSetModLayers();

  if (mod.layers.length <= 1) return null;

  const enabledCount = mod.layers.filter((l) => l.enabled).length;

  function handleToggle(layerName: string, enabled: boolean) {
    const layerStates: Record<string, boolean> = {};
    for (const layer of mod.layers) {
      layerStates[layer.name] = layer.name === layerName ? enabled : layer.enabled;
    }
    setModLayers.mutate({ modId: mod.id, layerStates });
  }

  // Popover content is portaled, so its clicks bubble up the React tree to the
  // card's onClick. Stopping propagation on this ancestor keeps the trigger and
  // popup from toggling the mod; `data-no-toggle` covers the in-DOM trigger too.
  return (
    <span data-no-toggle onClick={(e) => e.stopPropagation()}>
      <Popover.Root>
        <Popover.Trigger
          render={
            <Button size="xs" disabled={disabled} left={<Layers className="size-3.5" />}>
              {enabledCount}/{mod.layers.length}
            </Button>
          }
        />
        <Popover.Content side="bottom" align="start" sideOffset={6} className="w-64">
          <div className="p-2">
            <div className="mb-1 flex items-center gap-2">
              <Layers className="size-4 shrink-0 text-surface-400" />
              <Popover.Title className="min-w-0 truncate">{mod.displayName}</Popover.Title>
            </div>
            <Popover.Description className="text-xs">
              Choose which layers to apply. Enable the mod afterward to use them.
            </Popover.Description>
          </div>
          <LayerToggleList
            layers={mod.layers}
            onToggle={handleToggle}
            disabled={disabled}
            className="rounded-b-lg"
          />
        </Popover.Content>
      </Popover.Root>
    </span>
  );
}

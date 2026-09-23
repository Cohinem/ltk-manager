import { IntersectThreeIcon } from "@phosphor-icons/react";

import { IconButton, Menu, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { MapLayer } from "@/modules/viewport";

export interface BackdropLayerMenuProps {
  /** Every layer a mesh of the map names, in bit order. */
  readonly layers: readonly MapLayer[];
  /** The active visibility flags, as a mask. */
  readonly flags: number;
  readonly onLayerChange: (index: number, on: boolean) => void;
}

/**
 * A map's visibility layers as ticks, each drawing or hiding what the map stands on it.
 *
 * Every tick is independent and the menu stays open across them, so two variants can be
 * stacked to compare them. A layer's count is every triangle it draws, shared meshes
 * included.
 */
export function BackdropLayerMenu({ layers, flags, onLayerChange }: BackdropLayerMenuProps) {
  return (
    <Menu.Root>
      <Tooltip content={m.workshop_bin_preview_backdrop_layers_label()}>
        <Menu.Trigger
          render={
            <IconButton
              variant="ghost"
              size="xs"
              compact
              aria-label={m.workshop_bin_preview_backdrop_layers_label()}
              icon={<IntersectThreeIcon weight="bold" className="h-4 w-4" />}
            />
          }
        />
      </Tooltip>
      <Menu.Portal>
        <Menu.Positioner align="end">
          <Menu.Popup data-ui="BackdropLayerMenu" className="w-60">
            <Menu.Group>
              <Menu.GroupLabel>{m.workshop_bin_preview_backdrop_layers_label()}</Menu.GroupLabel>
              {layers.length === 0 && (
                <Menu.Item disabled>
                  {m.workshop_bin_preview_backdrop_layers_empty_label()}
                </Menu.Item>
              )}
              {layers.map((layer) => (
                <Menu.CheckboxItem
                  key={layer.index}
                  closeOnClick={false}
                  checked={(flags & (1 << layer.index)) !== 0}
                  onCheckedChange={(checked) => onLayerChange(layer.index, checked)}
                >
                  <span className="flex items-baseline justify-between gap-3">
                    {m.workshop_bin_preview_backdrop_layer_label({ number: layer.index + 1 })}
                    <span className="text-meta text-surface-400 tabular-nums">
                      {m.workshop_bin_preview_backdrop_layer_triangles_label({
                        count: layer.triangles,
                        formatted: layer.triangles.toLocaleString(),
                      })}
                    </span>
                  </span>
                </Menu.CheckboxItem>
              ))}
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

import {
  CaretDownIcon,
  CastleTurretIcon,
  FrameCornersIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { Button, IconButton, Menu, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { BinDocumentId, MapPath, MapVariant } from "@/lib/tauri";
import { type Bounds, FitCamera, Viewport } from "@/modules/viewport";
import {
  usePreviewBackdropParticles,
  usePreviewBackdropStructures,
  usePreviewCamera,
  useSetPreviewDisplay,
} from "@/stores";

import { assetKey } from "../../../preview/utils/assetRef";
import { DocumentOpener } from "../../skin/hooks/useGraphSource";
import { CameraMenu } from "../../vfx/preview/components/CameraMenu";
import { Notice } from "../../vfx/preview/components/Notice";
import { ViewToggle } from "../../vfx/preview/components/ViewToggle";
import { Passes } from "../../vfx/rendering/components/Passes";
import { distorts } from "../../vfx/rendering/utils/drawKind";
import { fades } from "../../vfx/rendering/utils/softParticle";
import { mapQueries } from "../api/mapQueries";
import { useMapMaterialsFile, useMapParticles } from "../hooks/useMapParticles";
import { openingVariant, variantLabel } from "../utils/mapVariants";
import { MapCharacters } from "./MapCharacters";
import { MapParticles } from "./MapParticles";

/**
 * What a free camera frames of a map, around where the middle of the map stands.
 *
 * A lane across with room over it. A whole map is past what the free presets dolly out
 * to, and the match camera frames nothing, standing a distance of its own off the point.
 */
const MAP_FRAME: Bounds = { min: [-1500, 0, -1500], max: [1500, 600, 1500] };

export interface MapViewportProps {
  readonly document: BinDocumentId;
  /** The `Map`, `MapSkin` or `MapContainer` object, `0x` and eight hex digits. */
  readonly entry: string;
}

/**
 * The map a `Map`, a `MapSkin` or a `MapContainer` draws, with what it plays and stands.
 *
 * A `Map` draws one of the skins it lists, which the reader picks between.
 */
export default function MapViewport({ document, entry }: MapViewportProps) {
  const variants = useQuery(mapQueries.variants(document, entry));

  if (variants.error !== null) return <Notice text={m.workshop_bin_map_preview_failed_empty()} />;
  if (variants.data === undefined) {
    return <Notice text={m.workshop_bin_map_preview_loading_label()} />;
  }
  const opening = openingVariant(variants.data);
  if (opening === null) return <Notice text={m.workshop_bin_map_preview_missing_empty()} />;
  return <MapScene document={document} variants={variants.data} opening={opening} />;
}

interface MapSceneProps {
  /** The document the object lives in, whose project answers before the install. */
  readonly document: BinDocumentId;
  readonly variants: readonly MapVariant[];
  /** The variant drawn until the reader picks another. */
  readonly opening: MapVariant;
}

function MapScene({ document, variants, opening }: MapSceneProps) {
  const [picked, setPicked] = useState<MapPath | null>(null);
  const chosen = variants.find((variant) => variant.map === picked) ?? opening;
  const source = useMemo(() => ({ map: chosen.map, document }), [chosen.map, document]);

  const camera = usePreviewCamera();
  const particles = usePreviewBackdropParticles();
  const structures = usePreviewBackdropStructures();
  const setDisplay = useSetPreviewDisplay();

  const [origin, setOrigin] = useState<readonly [number, number, number] | null>(null);
  /* One open file answers both what the map plays and what it stands. */
  const mapFile = useMapMaterialsFile(particles || structures ? chosen.map : null);
  const played = useMapParticles(particles ? mapFile.document : null);
  const warps = played.some((group) => group.system.emitters.some(distorts));
  const softens = played.some((group) => group.system.emitters.some(fades));

  const [fitToken, setFitToken] = useState(0);
  const refit = useCallback(() => setFitToken((token) => token + 1), []);

  return (
    <>
      {mapFile.source !== null && (
        /* Keyed, so a change of map lets the last handle go before the next answers. */
        <DocumentOpener
          key={assetKey(mapFile.source)}
          asset={mapFile.source}
          onOpen={mapFile.onOpen}
        />
      )}
      <div data-ui="MapViewport" className="relative min-h-0 flex-1">
        <Viewport
          stage={false}
          textured={false}
          backdrop={source}
          camera={camera}
          onCameraStand={(preset) => setDisplay({ previewCamera: preset })}
          onBackdropOrigin={setOrigin}
        >
          {origin !== null && <FitCamera bounds={MAP_FRAME} ground={origin} token={fitToken} />}
          <Passes warps={warps} softens={softens} />
          <MapParticles groups={played} />
          {structures && <MapCharacters document={mapFile.document} />}
        </Viewport>
        {origin === null && (
          <div className="pointer-events-none absolute inset-0 flex">
            <Notice text={m.workshop_bin_map_preview_loading_label()} />
          </div>
        )}

        <div
          data-ui="MapViewport:controls"
          /* DS-GLASS, DS-RADIUS, DS-VEIL. The descendant selector outranks the size of each button. */
          className="absolute top-2 right-2 flex items-center gap-1 rounded-md border border-surface-veil bg-scrim p-0.5 shadow-md backdrop-blur-sm [&_button]:text-meta"
        >
          {variants.length > 1 && (
            <VariantMenu variants={variants} chosen={chosen} onPick={setPicked} />
          )}
          <ViewToggle
            label={m.workshop_bin_preview_backdrop_particles_label()}
            active={particles}
            icon={<SparkleIcon weight="bold" className="h-4 w-4" />}
            onClick={() => setDisplay({ previewBackdropParticles: !particles })}
          />
          <ViewToggle
            label={m.workshop_bin_preview_backdrop_structures_label()}
            active={structures}
            icon={<CastleTurretIcon weight="bold" className="h-4 w-4" />}
            onClick={() => setDisplay({ previewBackdropStructures: !structures })}
          />
          <CameraMenu />
          <Tooltip content={m.workshop_bin_mesh_preview_fit_action()}>
            <IconButton
              variant="ghost"
              size="xs"
              compact
              aria-label={m.workshop_bin_mesh_preview_fit_action()}
              icon={<FrameCornersIcon weight="bold" className="h-4 w-4" />}
              onClick={refit}
            />
          </Tooltip>
        </div>
      </div>
    </>
  );
}

interface VariantMenuProps {
  readonly variants: readonly MapVariant[];
  readonly chosen: MapVariant;
  readonly onPick: (map: MapPath) => void;
}

/** Which skin of a map the preview draws, named on a pill over a menu of them all. */
function VariantMenu({ variants, chosen, onPick }: VariantMenuProps) {
  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            variant="ghost"
            size="xs"
            compact
            aria-label={m.workshop_bin_map_preview_skin_label()}
            right={<CaretDownIcon weight="bold" className="h-3 w-3" />}
          >
            {variantLabel(chosen)}
          </Button>
        }
      />
      <Menu.Portal>
        <Menu.Positioner align="end">
          {/* A map lists up to 37 skins, more than a menu shows without scrolling. */}
          <Menu.Popup data-ui="MapSkinMenu" className="max-h-96 w-56 overflow-y-auto scrollbar-md">
            <Menu.RadioGroup value={chosen.map} onValueChange={(map) => onPick(map as MapPath)}>
              {variants.map((variant) => (
                <Menu.RadioItem key={`${variant.skin}:${variant.map}`} value={variant.map}>
                  {variantLabel(variant)}
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

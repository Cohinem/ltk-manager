import {
  CaretDownIcon,
  CastleTurretIcon,
  CloudSunIcon,
  ConfettiIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";

import { Button, IconButton, Menu } from "@/components";
import { m } from "@/i18n";
import type { AssetRef, BinDocumentId, MapPath, MapVariant } from "@/lib/tauri";
import { type Bounds, FitCamera, useBackdropFlags, useSceneColors } from "@/modules/viewport";
import {
  usePreviewAmbientOcclusion,
  usePreviewBackdropEvents,
  usePreviewBackdropParticles,
  usePreviewBackdropSky,
  usePreviewBackdropStructures,
  usePreviewPostEffects,
  usePreviewShaders,
  usePreviewSun,
  useSetPreviewDisplay,
} from "@/stores";

import { CameraMenu } from "../../shared/preview/CameraMenu";
import { Notice } from "../../shared/preview/Notice";
import { PreviewToggle, ShadersToggle } from "../../shared/preview/PreviewToggle";
import { PreviewViewport } from "../../shared/preview/PreviewViewport";
import { useFitRequest } from "../../shared/preview/useFitRequest";
import { ViewModeMenu } from "../../shared/preview/ViewModeMenu";
import { FitButton, ViewportControls } from "../../shared/preview/ViewportControls";
import { Passes } from "../../vfx/rendering/components/Passes";
import { passesOf } from "../../vfx/rendering/utils/passes";
import { useMapParticles } from "../hooks/useMapParticles";
import { useMapScene } from "../state/mapScene";
import { variantLabel } from "../utils/mapVariants";
import { BackdropLayerMenu } from "./BackdropLayerMenu";
import { BoxSelect } from "./BoxSelect";
import { MapCharacters } from "./MapCharacters";
import { MapFocus } from "./MapFocus";
import { MapMarkers } from "./MapMarkers";
import { MapParticles } from "./MapParticles";
import { PlaceableButtons, usePlaceablePicking } from "./PlaceablePicking";
import { PostEffectsControl } from "./PostEffectsControl";
import { SunControl } from "./SunControl";

/**
 * What a free camera frames of a map, around where the middle of the map stands.
 *
 * A lane across with room over it. A whole map is past what the free presets dolly out
 * to, and the match camera frames nothing, standing a distance of its own off the point.
 */
const MAP_FRAME: Bounds = { min: [-1500, 0, -1500], max: [1500, 600, 1500] };

export interface MapViewportProps {
  /**
   * An open document of the project whose layer answers the map's materials first, and
   * null for a scene opened off a file, which resolves through the map's own open bin.
   */
  readonly document: BinDocumentId | null;
}

/**
 * The map a `Map`, a `MapSkin` or a `MapContainer` draws, with what it plays and stands.
 *
 * A `Map` draws one of the skins it lists, which the reader picks between. Which one, and
 * what the outliner hid and sent the camera to, is the `MapSceneHost` above it.
 */
export default function MapViewport({ document }: MapViewportProps) {
  const { variants, failed, chosen, located, geometry, hasMaterials, materials } = useMapScene();
  const resolver = document ?? materials;

  if (failed) return <Notice text={m.workshop_bin_map_preview_failed_empty()} />;
  if (variants === undefined) return <Notice text={m.workshop_bin_map_preview_loading_label()} />;
  if (chosen === null) return <Notice text={m.workshop_bin_map_preview_missing_empty()} />;
  /* The materials read is keyed on the document it resolves through, so the scene waits
     for the one it will keep rather than reading them twice. */
  if (!located || (hasMaterials && resolver === null)) {
    return <Notice text={m.workshop_bin_map_preview_loading_label()} />;
  }
  if (geometry === null) return <Notice text={m.workshop_bin_map_preview_no_geometry_empty()} />;
  return <MapScene document={resolver} geometry={geometry} variants={variants} chosen={chosen} />;
}

interface MapSceneProps {
  readonly document: BinDocumentId | null;
  /** The chosen variant's `.mapgeo`, wherever the scene found it. */
  readonly geometry: AssetRef;
  readonly variants: readonly MapVariant[];
  readonly chosen: MapVariant;
}

function MapScene({ document, geometry, variants, chosen }: MapSceneProps) {
  const { pick, materials, hidden, focus, selected } = useMapScene();
  const box = useRef<HTMLDivElement>(null);
  const picking = usePlaceablePicking();
  const colors = useSceneColors();
  const shaders = usePreviewShaders();
  const source = useMemo(
    () => ({ map: chosen.map, document, geometry, shaders }),
    [chosen.map, document, geometry, shaders],
  );

  const particles = usePreviewBackdropParticles();
  const structures = usePreviewBackdropStructures();
  const sky = usePreviewBackdropSky();
  const sun = usePreviewSun();
  const postEffects = usePreviewPostEffects();
  const ambientOcclusion = usePreviewAmbientOcclusion();
  const setDisplay = useSetPreviewDisplay();
  const { layers, flags, setLayer } = useBackdropFlags(source);

  const [origin, setOrigin] = useState<readonly [number, number, number] | null>(null);
  const events = usePreviewBackdropEvents();
  const played = useMapParticles(particles ? materials : null, flags, {
    hidden,
    events,
    picked: selected,
  });
  const { warps, softens } = useMemo(() => passesOf(played.map((group) => group.system)), [played]);

  const [fitToken, refit] = useFitRequest();

  return (
    <>
      <div ref={box} data-ui="MapViewport" className="relative min-h-0 flex-1">
        <PreviewViewport
          renderer="shared"
          stage={false}
          textured={false}
          backdrop={source}
          backdropFlags={flags}
          backdropSky={sky}
          sun={sun}
          postEffects={postEffects}
          ambientOcclusion={ambientOcclusion}
          onBackdropOrigin={setOrigin}
        >
          {origin !== null && <FitCamera bounds={MAP_FRAME} ground={origin} token={fitToken} />}
          <Passes warps={warps} softens={softens} />
          <MapParticles groups={played} />
          {structures && <MapCharacters document={materials} flags={flags} hidden={hidden} />}
          <MapFocus focus={focus} colors={colors} />
          {picking.shown && (
            <MapMarkers
              items={picking.items}
              hidden={hidden}
              selected={selected}
              colors={colors}
              projector={picking.projector}
            />
          )}
        </PreviewViewport>
        <BoxSelect target={box} active={picking.boxing} onBox={picking.onBox} />
        {origin === null && (
          <div className="pointer-events-none absolute inset-0 flex">
            <Notice text={m.workshop_bin_map_preview_loading_label()} />
          </div>
        )}

        <ViewportControls data-ui="MapViewport:controls">
          {variants.length > 1 && <VariantMenu variants={variants} chosen={chosen} onPick={pick} />}
          <PreviewToggle
            flag="previewBackdropParticles"
            label={m.workshop_bin_preview_backdrop_particles_label()}
            icon={<SparkleIcon />}
          />
          <IconButton
            pressed={particles && events}
            icon={<ConfettiIcon />}
            onClick={() =>
              setDisplay({ previewBackdropParticles: true, previewBackdropEvents: !events })
            }
            label={m.workshop_bin_preview_backdrop_events_label()}
          />
          <PreviewToggle
            flag="previewBackdropStructures"
            label={m.workshop_bin_preview_backdrop_structures_label()}
            icon={<CastleTurretIcon />}
          />
          <PreviewToggle
            flag="previewBackdropSky"
            label={m.workshop_bin_preview_backdrop_sky_label()}
            icon={<CloudSunIcon />}
          />
          <ShadersToggle />
          <PlaceableButtons picking={picking} />
          <BackdropLayerMenu layers={layers} flags={flags} onLayerChange={setLayer} />
          <SunControl source={source} />
          <PostEffectsControl source={source} />
          <ViewModeMenu />
          <CameraMenu />
          <FitButton label={m.workshop_bin_mesh_preview_fit_action()} onFit={refit} />
        </ViewportControls>
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
            aria-label={m.workshop_bin_map_preview_skin_label()}
            right={<CaretDownIcon weight="bold" className="size-3" />}
          >
            {variantLabel(chosen)}
          </Button>
        }
      />
      {/* A map lists up to 37 skins, more than a menu shows without scrolling. */}
      <Menu.Content
        align="end"
        data-ui="MapSkinMenu"
        className="max-h-96 w-56 overflow-y-auto scrollbar-md"
      >
        <Menu.RadioGroup value={chosen.map} onValueChange={(map) => onPick(map as MapPath)}>
          {variants.map((variant) => (
            <Menu.RadioItem key={`${variant.skin}:${variant.map}`} value={variant.map}>
              {variantLabel(variant)}
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
      </Menu.Content>
    </Menu.Root>
  );
}

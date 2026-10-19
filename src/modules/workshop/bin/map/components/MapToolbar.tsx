import {
  ArrowClockwiseIcon,
  ArrowsOutCardinalIcon,
  ArrowsOutIcon,
  CaretDownIcon,
  CubeFocusIcon,
  CursorIcon,
  ExportIcon,
  EyeIcon,
  FilePlusIcon,
  FloppyDiskIcon,
  FrameCornersIcon,
  type Icon,
  MagnetIcon,
  PlusCircleIcon,
} from "@phosphor-icons/react";

import { Button, IconButton, Menu } from "@/components";
import { m } from "@/i18n";
import type { MapPath, MapVariant } from "@/lib/tauri";
import type { BackdropSource } from "@/modules/viewport";
import {
  type PreviewDisplay,
  type PreviewFlag,
  usePreviewBackdropEvents,
  usePreviewBackdropParticles,
  usePreviewFlag,
  useSetPreviewDisplay,
} from "@/stores";

import { CameraMenu } from "../../shared/preview/CameraMenu";
import { ViewModeMenu } from "../../shared/preview/ViewModeMenu";
import { ControlDivider, ViewportRail } from "../../shared/preview/ViewportControls";
import { useMeshExport } from "../hooks/useMeshFiles";
import { type MapTool, useMapScene } from "../state/mapScene";
import { variantLabel } from "../utils/mapVariants";
import { BoxSelectButton, type PlaceablePicking } from "./PlaceablePicking";
import { PlaceMenu } from "./PlaceMenu";
import { PostEffectsControl } from "./PostEffectsControl";
import { SunControl } from "./SunControl";

const TOOLS: readonly { tool: MapTool; icon: Icon; label: () => string }[] = [
  { tool: "select", icon: CursorIcon, label: m.workshop_bin_map_tool_select_label },
  { tool: "move", icon: ArrowsOutCardinalIcon, label: m.workshop_bin_map_tool_move_label },
  { tool: "rotate", icon: ArrowClockwiseIcon, label: m.workshop_bin_map_tool_rotate_label },
  { tool: "scale", icon: ArrowsOutIcon, label: m.workshop_bin_map_tool_scale_label },
  { tool: "place", icon: PlusCircleIcon, label: m.workshop_bin_map_tool_place_label },
];

/** The display switches of the Show menu, each bound to one display preference. */
const SHOWN: readonly { flag: PreviewFlag; label: () => string }[] = [
  { flag: "previewBackdropParticles", label: m.workshop_bin_preview_backdrop_particles_label },
  { flag: "previewBackdropStructures", label: m.workshop_bin_preview_backdrop_structures_label },
  { flag: "previewBackdropSky", label: m.workshop_bin_preview_backdrop_sky_label },
  { flag: "previewShaders", label: m.workshop_bin_preview_shaders_label },
];

/**
 * The tool rail down the viewport's left edge: the tools of an editable map, one pressed at a
 * time, the box select, and the gizmo's axes and snap. A read-only map shows only the box select.
 * Per "Tools" in docs/ux/MAP_EDITOR.md.
 */
export function ToolRail({ picking }: { picking: PlaceablePicking }) {
  const { tool, setTool, space, setSpace, snap, setSnap, editable } = useMapScene();
  const local = space === "local";

  return (
    <ViewportRail side="left" data-ui="MapViewport:tools">
      {editable &&
        TOOLS.map(({ tool: each, icon: Glyph, label }) => (
          <IconButton
            key={each}
            pressed={tool === each}
            icon={<Glyph />}
            onClick={() => setTool(each)}
            label={label()}
          />
        ))}
      {editable && <ControlDivider side="left" />}
      <BoxSelectButton picking={picking} />
      {editable && (
        <>
          <ControlDivider side="left" />
          <IconButton
            pressed={local}
            icon={<CubeFocusIcon />}
            onClick={() => setSpace(local ? "world" : "local")}
            label={m.workshop_bin_map_tool_local_label()}
          />
          <IconButton
            pressed={snap}
            icon={<MagnetIcon />}
            onClick={() => setSnap(!snap)}
            label={m.workshop_bin_map_tool_snap_label()}
          />
        </>
      )}
    </ViewportRail>
  );
}

export interface TopRailProps {
  readonly picking: PlaceablePicking;
  /** The backdrop whose sun and post effects a read-only map previews. */
  readonly source: BackdropSource | null;
  readonly variants: readonly MapVariant[];
  readonly chosen: MapVariant;
  readonly onPick: (map: MapPath) => void;
  /** Opens the file picker of the mesh import. */
  readonly onAddMesh: () => void;
  readonly onFrame: () => void;
}

/**
 * The rail across the viewport's top edge: the current tool's options, the file actions and the
 * skin on the left, and what the viewport shows and how it looks on the right.
 */
export function TopRail({
  picking,
  source,
  variants,
  chosen,
  onPick,
  onAddMesh,
  onFrame,
}: TopRailProps) {
  const { editable, tool, geometryDocument } = useMapScene();
  const exportMeshes = useMeshExport();

  return (
    <ViewportRail side="top" data-ui="MapViewport:controls">
      {editable && tool === "place" && (
        <>
          <PlaceMenu />
          <ControlDivider />
        </>
      )}
      {editable && geometryDocument !== null && (
        <>
          <Button
            variant="ghost"
            size="xs"
            left={<FilePlusIcon weight="bold" />}
            onClick={onAddMesh}
          >
            {m.workshop_bin_map_import_short_label()}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            left={<ExportIcon weight="bold" />}
            onClick={() => void exportMeshes(null)}
            aria-label={m.workshop_bin_map_export_map_action()}
          >
            {m.workshop_bin_map_export_short_label()}
          </Button>
          <SaveGeometryButton dirty={geometryDocument.dirty} />
          <ControlDivider />
        </>
      )}
      {variants.length > 1 && <VariantMenu variants={variants} chosen={chosen} onPick={onPick} />}
      <span className="flex-1" />
      <ShowMenu picking={picking} />
      {/* An editable map edits its sun and post effects in the Lighting pane. */}
      {!editable && <SunControl source={source} />}
      {!editable && <PostEffectsControl source={source} />}
      <ControlDivider />
      <ViewModeMenu />
      <CameraMenu />
      <Button variant="ghost" size="xs" left={<FrameCornersIcon weight="bold" />} onClick={onFrame}>
        {m.workshop_bin_map_frame_label()}
      </Button>
    </ViewportRail>
  );
}

/** What the viewport draws besides the map, as switches in one menu. */
function ShowMenu({ picking }: { picking: PlaceablePicking }) {
  const { setMarkers } = useMapScene();
  const particles = usePreviewBackdropParticles();
  const events = usePreviewBackdropEvents();
  const setDisplay = useSetPreviewDisplay();

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            variant="ghost"
            size="xs"
            left={<EyeIcon weight="bold" />}
            right={<CaretDownIcon weight="bold" className="size-3" />}
          >
            {m.workshop_bin_map_show_label()}
          </Button>
        }
      />
      <Menu.Content align="end" data-ui="MapShowMenu" className="w-52">
        {SHOWN.map(({ flag, label }) => (
          <ShowItem key={flag} flag={flag} label={label()} />
        ))}
        <Menu.CheckboxItem
          checked={particles && events}
          onCheckedChange={() =>
            setDisplay({ previewBackdropParticles: true, previewBackdropEvents: !events })
          }
        >
          {m.workshop_bin_preview_backdrop_events_label()}
        </Menu.CheckboxItem>
        <Menu.Separator />
        <Menu.CheckboxItem
          checked={picking.shown}
          onCheckedChange={() => {
            setMarkers(!picking.shown);
            if (picking.shown) picking.setBoxing(false);
          }}
        >
          {m.workshop_bin_map_markers_label()}
        </Menu.CheckboxItem>
      </Menu.Content>
    </Menu.Root>
  );
}

function ShowItem({ flag, label }: { flag: PreviewFlag; label: string }) {
  const on = usePreviewFlag(flag);
  const setDisplay = useSetPreviewDisplay();

  return (
    <Menu.CheckboxItem
      checked={on}
      onCheckedChange={() => setDisplay({ [flag]: !on } as Partial<PreviewDisplay>)}
    >
      {label}
    </Menu.CheckboxItem>
  );
}

/** Writes the open `.mapgeo`, enabled while it holds unsaved changes. */
function SaveGeometryButton({ dirty }: { dirty: boolean }) {
  const { saveGeometry } = useMapScene();

  return (
    <Button
      variant="ghost"
      size="xs"
      left={<FloppyDiskIcon weight="bold" />}
      disabled={!dirty}
      onClick={() => void saveGeometry()}
      aria-label={m.workshop_bin_map_geometry_save_action()}
    >
      {m.workshop_bin_map_geometry_save_label()}
    </Button>
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
        align="start"
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

import {
  ArrowsClockwiseIcon,
  CaretDownIcon,
  CheckIcon,
  CubeIcon,
  CylinderIcon,
  GridFourIcon,
  type Icon,
  SphereIcon,
  SquareIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { NoColorSpace } from "three";

import { Button, Menu } from "@/components";
import { m } from "@/i18n";
import type { BinDocumentId, MaterialProgram } from "@/lib/tauri";
import {
  FitCamera,
  MaterialSubject,
  PREVIEW_BOUNDS,
  PREVIEW_SHAPES,
  type PreviewShape,
  programPasses,
  programTextureAssets,
  useAssetTextures,
} from "@/modules/viewport";
import {
  usePreviewGround,
  usePreviewMaterialShape,
  usePreviewTurntable,
  useSetPreviewDisplay,
} from "@/stores";

import { CameraMenu } from "../../shared/preview/CameraMenu";
import { Notice } from "../../shared/preview/Notice";
import { PreviewToggle } from "../../shared/preview/PreviewToggle";
import { PreviewViewport } from "../../shared/preview/PreviewViewport";
import { useFitRequest } from "../../shared/preview/useFitRequest";
import { ControlDivider, FitButton, ViewportControls } from "../../shared/preview/ViewportControls";
import { Passes } from "../../vfx/rendering/components/Passes";
import { materialQueries } from "../api/materialQueries";
import { useHeldValue } from "../state/heldValue";

/** The shaders decode their own texels, so a program's textures upload as stored. */
const RAW_TEXTURES = { colorSpace: NoColorSpace } as const;

const ORIGIN: [number, number, number] = [0, 0, 0];

const NO_PROGRAMS: readonly MaterialProgram[] = [];

const SHAPE_LABEL: Record<PreviewShape, () => string> = {
  sphere: m.workshop_bin_material_shape_sphere_label,
  cube: m.workshop_bin_material_shape_cube_label,
  plane: m.workshop_bin_material_shape_plane_label,
  cylinder: m.workshop_bin_material_shape_cylinder_label,
};

const SHAPE_ICON: Record<PreviewShape, Icon> = {
  sphere: SphereIcon,
  cube: CubeIcon,
  plane: SquareIcon,
  cylinder: CylinderIcon,
};

export interface MaterialViewportProps {
  document: BinDocumentId;
  entry: string | null;
}

/**
 * The material's translated passes on a preview shape, under the stage and camera a
 * character stands in. "The material shell" in docs/ux/BIN_EDITOR.md.
 *
 * The read is the open document's, so an edit reaches the preview once it lands.
 */
export default function MaterialViewport({ document, entry }: MaterialViewportProps) {
  const query = useQuery(materialQueries.program(document, entry));
  const program = query.data ?? null;
  const programs = useMemo(() => (program === null ? NO_PROGRAMS : [program]), [program]);
  const assets = useMemo(() => programTextureAssets(programs), [programs]);
  const textures = useAssetTextures(assets, RAW_TEXTURES);
  const drawn = useMemo(() => programPasses(program, textures), [program, textures]);

  const shape = usePreviewMaterialShape();
  const turntable = usePreviewTurntable();
  const held = useHeldValue();
  const ground = usePreviewGround();
  const setDisplay = useSetPreviewDisplay();
  const [fitToken, refit] = useFitRequest();

  if (query.error !== null) {
    return <Notice text={m.workshop_bin_material_preview_failed_empty()} />;
  }
  if (query.data === undefined) {
    return <Notice text={m.workshop_bin_material_preview_loading_label()} />;
  }
  if (program === null) {
    return <Notice text={m.workshop_bin_material_preview_failed_empty()} />;
  }

  return (
    <div data-ui="MaterialViewport" className="relative min-h-0 flex-1">
      <PreviewViewport plainView stage={ground} textured={false}>
        <FitCamera bounds={PREVIEW_BOUNDS} ground={ORIGIN} token={fitToken} />
        <Passes warps={false} softens={false} />
        <MaterialSubject
          programs={drawn}
          skinned={program.kind === "skinnedMesh"}
          shape={shape}
          turntable={turntable}
          held={held}
        />
      </PreviewViewport>

      <ViewportControls data-ui="MaterialViewport:controls">
        <ShapeMenu
          shape={shape}
          onPick={(picked) => setDisplay({ previewMaterialShape: picked })}
        />
        <PreviewToggle
          flag="previewTurntable"
          label={m.workshop_bin_material_preview_turntable_label()}
          icon={<ArrowsClockwiseIcon />}
        />
        <PreviewToggle
          flag="previewGround"
          label={m.workshop_bin_preview_stage_label()}
          icon={<GridFourIcon />}
        />
        <ControlDivider />
        <CameraMenu />
        <FitButton label={m.workshop_bin_material_fit_action()} onFit={refit} />
      </ViewportControls>
    </div>
  );
}

/** Which shape the material draws on, named on a pill over a menu of the four. */
function ShapeMenu({
  shape,
  onPick,
}: {
  shape: PreviewShape;
  onPick: (shape: PreviewShape) => void;
}) {
  const Shown = SHAPE_ICON[shape];

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            variant="ghost"
            size="xs"
            aria-label={m.workshop_bin_material_shape_label()}
            left={<Shown weight="bold" className="size-4" />}
            right={<CaretDownIcon weight="bold" className="size-3" />}
          >
            {SHAPE_LABEL[shape]()}
          </Button>
        }
      />
      <Menu.Content align="end" data-ui="MaterialViewport:shapes" className="w-36">
        {PREVIEW_SHAPES.map((each) => (
          <Menu.Item
            key={each}
            icon={each === shape && <CheckIcon weight="bold" className="size-4" />}
            onClick={() => onPick(each)}
          >
            {SHAPE_LABEL[each]()}
          </Menu.Item>
        ))}
      </Menu.Content>
    </Menu.Root>
  );
}

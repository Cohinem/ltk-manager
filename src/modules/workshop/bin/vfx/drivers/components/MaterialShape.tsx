import { CubeIcon, CylinderIcon, type Icon, SphereIcon, SquareIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { use, useState } from "react";
import { Sphere, Vector3 } from "three";

import { m } from "@/i18n";
import type { MaterialProgram } from "@/lib/tauri";
import {
  MaterialSubject,
  PREVIEW_BOUNDS,
  PREVIEW_SHAPES,
  type PreviewShape,
} from "@/modules/viewport";
import { twMerge } from "@/utils";

import { vfxQueries } from "../../hooks/useVfxSystem";
import { useMaterialPasses } from "../../rendering/hooks/useParticlePrograms";
import { NODE_PREVIEW_SIZE } from "../utils/driverLayout";
import { GraphActionsContext, NO_DOCUMENT } from "./graphActions";
import { NODE_BOX, Turntable } from "./NodePreviews";
import { PreviewView } from "./PreviewView";
import { StripButton } from "./StripButton";

const BOX_STYLE = { width: NODE_PREVIEW_SIZE, height: NODE_PREVIEW_SIZE } as const;

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

/* The shapes stand on the ground, so the turntable turns them about the middle of their box. */
const MIDDLE = new Vector3(...PREVIEW_BOUNDS.min)
  .add(new Vector3(...PREVIEW_BOUNDS.max))
  .multiplyScalar(0.5);
const SHIFT: [number, number, number] = [-MIDDLE.x, -MIDDLE.y, -MIDDLE.z];

/** The reach the camera frames, a little past the widest shape's half width so a cube's corners fit. */
const FRAMED = new Sphere(
  new Vector3(),
  ((PREVIEW_BOUNDS.max[0] - PREVIEW_BOUNDS.min[0]) / 2) * 1.3,
);

/**
 * A material node's material on a preview shape, a sphere until the reader picks another,
 * drawn with its translated passes as the material shell's preview draws it. The Component
 * row of decision 2.8 in docs/plans/shimmer-driver-graph.md.
 */
export function MaterialShape({ entry }: { entry: string | undefined }) {
  const [shape, setShape] = useState<PreviewShape>("sphere");
  const actions = use(GraphActionsContext);
  const document = actions?.document ?? null;
  const system = useQuery({
    ...vfxQueries.system(document ?? NO_DOCUMENT, actions?.entry ?? ""),
    enabled: document !== null && actions?.entry !== "",
  }).data;
  const source = system?.materials.find((each) => each.hash === entry)?.source ?? null;
  const { program, passes, failed } = useMaterialPasses(document, entry ?? null, source);

  return (
    <div data-ui="MaterialShape" className={twMerge(NODE_BOX, "relative")} style={BOX_STYLE}>
      {program != null && (
        <PreviewView className="absolute inset-0">
          <Turntable sphere={FRAMED}>
            <group position={SHIFT}>
              <MaterialSubject
                programs={passes}
                skinned={program.kind === "skinnedMesh"}
                shape={shape}
                turntable={false}
              />
            </group>
          </Turntable>
        </PreviewView>
      )}
      <Note entry={entry} program={program} failed={failed} />
      <div
        role="group"
        aria-label={m.workshop_bin_material_shape_label()}
        /* DS-GLASS, DS-RADIUS, DS-VEIL */
        className="absolute bottom-1 left-1 flex items-center gap-1 rounded-sm border border-surface-veil bg-scrim p-0.5 backdrop-blur-sm"
      >
        {PREVIEW_SHAPES.map((each) => {
          const Glyph = SHAPE_ICON[each];
          return (
            <StripButton
              key={each}
              label={SHAPE_LABEL[each]()}
              pressed={each === shape}
              onClick={() => setShape(each)}
            >
              <Glyph weight="bold" className="h-3 w-3" />
            </StripButton>
          );
        })}
      </div>
    </div>
  );
}

/** Why the box draws no shape: the read runs, or it found no material to draw. */
function Note({
  entry,
  program,
  failed,
}: {
  entry: string | undefined;
  program: MaterialProgram | null | undefined;
  failed: boolean;
}) {
  const reading = entry !== undefined && program === undefined && !failed;
  const missing = entry === undefined || failed || program === null;
  if (!reading && !missing) return null;

  return (
    <span className="absolute inset-0 flex items-center justify-center p-4 text-center text-meta text-surface-400">
      {reading && m.workshop_bin_material_preview_loading_label()}
      {missing && m.workshop_bin_material_preview_failed_empty()}
    </span>
  );
}

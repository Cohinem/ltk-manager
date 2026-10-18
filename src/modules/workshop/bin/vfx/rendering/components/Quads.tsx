import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import type { Mesh } from "three";

import type { BinDocumentId } from "@/lib/tauri";
import { AXIS_SIGN } from "@/modules/viewport";

import type { EmitterModel } from "../../engine/model/model";
import {
  age01,
  appearance,
  type DrawFrame,
  drawnPlace,
  drawnPlaceInto,
  erosionDrive,
  frameOf,
  particleBasisInto,
  type Source,
  spinOf,
  stretchOf,
  travelBasisInto,
} from "../../engine/simulation/particleRead";
import { FRAME_SLOTS } from "../../engine/simulation/pool";
import { mirrorInto } from "../../engine/utils/basis";
import { useParticlePrograms } from "../hooks/useParticlePrograms";
import type { EmitterSamplers } from "../hooks/useVfxTextures";
import { useDrawStencil } from "../state/stencil";
import { fragmentTests, premultiplyInto, sortsBackToFront } from "../utils/blend";
import {
  QUAD_LAYOUT,
  QUAD_STRIDE,
  type QuadBuffers,
  quadBuffers,
  QUADS_PER_EMITTER,
  rowsWritten,
} from "../utils/buffers";
import { colorLookupInto } from "../utils/colorLookup";
import { castsShadow, drawsAsQuad, facesTheCamera } from "../utils/drawKind";
import { bucketRange, bucketsOf, renderStamp } from "../utils/emitterBuckets";
import { drawLayersOf } from "../utils/frame";
import { quadMaterial, quadOrientation } from "../utils/materials";
import { sourcesScrollInto } from "../utils/palette";
import { quadDraw } from "../utils/particleDraws";
import { writePaletteScroll } from "../utils/particleProgram";
import { type LayerDraws, layersOf } from "../utils/uniforms";
import { layerOf, uvDraw, uvTransformInto } from "../utils/uvTransform";
import { DrawPair, showPair, useDrawPair, useProgramDraw } from "./drawPair";

/** Scratch the appearance pass writes into, reused across every particle of a frame. */
const DRAWN = { scale: new Float32Array(3), color: new Float32Array(4) };

/** The same, for whichever of the two layers the write is on. */
const UV_DRAWN = uvDraw();

/** The basis one particle stands on, in the engine's space and then the viewport's. */
const BASIS = new Float32Array(FRAME_SLOTS);
const MIRRORED = new Float32Array(FRAME_SLOTS);

/** Where one particle draws, in the engine's space, before the mirror. */
const PLACED = drawnPlace();

/** The pool holds degrees and the shader's basis takes radians. */
const DEGREE = Math.PI / 180;

/** The ramp and the soft fade a quad's shader compiles, and neither the rim nor the reflection. */
const DRAWS: LayerDraws = { ramp: true, sheen: false, fade: true };

/** The particles one frame draws, by slot: which pool index, of which source, in what order. */
interface Picked {
  readonly order: Int32Array;
  readonly owner: Int32Array;
  readonly drawing: Int32Array;
}

export interface QuadsProps {
  emitter: EmitterModel;
  /**
   * Every system whose pool holds this emitter's particles, read every frame.
   *
   * The driver for an emitter of the opened system, and each live child for an emitter of
   * a child. The clock each carries is read rather than passed, because its value moves
   * every frame and a prop carrying it would rerender each emitter at the display's rate.
   */
  sources: readonly Source[];
  samplers: EmitterSamplers;
  /** Where the emitter falls in the system's draw order, from `drawRanks`. */
  rank: number;
  hidden: boolean;
  /** How many particles the buffers hold, which a scene of many small systems lowers. */
  room?: number;
  /** The document the system was read from, whose project the game's shaders resolve through. */
  document?: BinDocumentId | null;
}

/**
 * One emitter's particles, as quads: camera-facing, arbitrary, or rays.
 *
 * A frame writes instanced arrays and leaves the expansion to the vertex shader, so no
 * matrix per particle reaches the GPU. A camera quad takes its roll alone, an arbitrary
 * quad and a ray the basis the CPU builds for the particle, and a simple emitter's quad
 * the world plane its `orientation` names.
 *
 * With the game's shaders on, the quads draw through the translated programs once they are
 * ready: the engine's `quad` or `distortion` pair, or each pass of a custom material, a later
 * pass on a twin of the mesh. The hand-written material draws until then and wherever none
 * can.
 */
export function Quads({
  emitter,
  sources,
  samplers,
  rank,
  hidden,
  room = QUADS_PER_EMITTER,
  document = null,
}: QuadsProps) {
  const buffers = useMemo(() => quadBuffers(room), [room]);
  const orientation = useMemo(() => quadOrientation(emitter), [emitter]);
  const material = useMemo(
    () =>
      quadMaterial(
        emitter.blendMode,
        samplers.base,
        { bias: emitter.depthBias, pushPull: emitter.depthPushPull },
        orientation,
        layersOf(emitter, samplers, DRAWS),
        fragmentTests(emitter),
      ),
    [emitter, samplers, orientation],
  );

  useEffect(() => () => buffers.geometry.dispose(), [buffers]);

  const pair = useDrawPair<Mesh>(material, drawLayersOf(emitter), castsShadow(emitter));
  const draw = useMemo(() => quadDraw(orientation), [orientation]);
  const programs = useParticlePrograms(emitter, samplers, draw, buffers.geometry, document);
  const program = programs[0] ?? null;
  useProgramDraw(pair.solid, programs, rank);

  const drawn = !hidden && !emitter.disabled && drawsAsQuad(emitter);
  useDrawStencil(emitter, drawn, material, programs);
  const sorted =
    emitter.customMaterial !== null && !emitter.customMaterial.missing
      ? emitter.customMaterial.renderState.blending !== "opaque"
      : sortsBackToFront(emitter.blendMode);

  /* Scratch keyed by the emitter's own slot rather than by a pool index, which runs to a
     whole pool's capacity: the particles, the depth each stands at from the eye. */
  const picked = useMemo<Picked>(
    () => ({
      order: new Int32Array(room),
      owner: new Int32Array(room),
      drawing: new Int32Array(room),
    }),
    [room],
  );
  const depth = useMemo(() => new Float32Array(room), [room]);

  useFrame((state) => {
    if (!drawn) {
      buffers.geometry.instanceCount = 0;
      showPair(pair, false);
      return;
    }

    const stamp = renderStamp(state.gl);
    const frames = sources.map((source) => frameOf(source, emitter));
    const scroll = material.uniforms.paletteScroll.value as number[];
    sourcesScrollInto(emitter, sources, scroll);
    for (const each of programs) writePaletteScroll(each.material, scroll);

    let held = 0;
    sources.forEach((source, from) => {
      const pool = source.pool;
      const buckets = bucketsOf(pool, stamp);
      const [first, last] = bucketRange(buckets, emitter.index);
      for (let listed = first; listed < last && held < room; listed += 1) {
        const at = buckets.order[listed];
        picked.order[held] = at;
        picked.owner[held] = from;
        picked.drawing[held] = held;
        held += 1;
      }
    });

    if (sorted) {
      const eye = state.camera.position;
      for (let slot = 0; slot < held; slot += 1) {
        const from = picked.owner[slot];
        drawnPlaceInto(sources[from].pool, picked.order[slot], frames[from], PLACED);
        const x = PLACED.place[0] * AXIS_SIGN[0] - eye.x;
        const y = PLACED.place[1] * AXIS_SIGN[1] - eye.y;
        const z = PLACED.place[2] * AXIS_SIGN[2] - eye.z;
        depth[slot] = x * x + y * y + z * z;
      }
      picked.drawing.subarray(0, held).sort((left, right) => depth[right] - depth[left]);
    }

    write(sources, frames, emitter, picked, held, buffers);
    buffers.geometry.instanceCount = held;
    showPair(pair, held > 0);
  });

  return (
    <DrawPair
      pair={pair}
      geometry={buffers.geometry}
      material={program?.material ?? material}
      rank={rank}
    />
  );
}

/* Each attribute's first float in a quad's row. */
const CENTER = QUAD_LAYOUT.center[0];
const SIZE = QUAD_LAYOUT.size[0];
const COLOR = QUAD_LAYOUT.color[0];
const ROLL = QUAD_LAYOUT.roll[0];
const BASES = [QUAD_LAYOUT.basisX[0], QUAD_LAYOUT.basisY[0], QUAD_LAYOUT.basisZ[0]] as const;
const TURNS = [QUAD_LAYOUT.uvTurn[0], QUAD_LAYOUT.uvTurnMult[0]] as const;
const SHIFTS = [QUAD_LAYOUT.uvShift[0], QUAD_LAYOUT.uvShiftMult[0]] as const;
const LOOKUP = QUAD_LAYOUT.lookup[0];

/** Writes the row of each picked particle in sorted draw order. */
function write(
  sources: readonly Source[],
  frames: readonly DrawFrame[],
  emitter: EmitterModel,
  picked: Picked,
  held: number,
  buffers: QuadBuffers,
): void {
  const rows = buffers.rows.array as Float32Array;
  const camera = facesTheCamera(emitter);

  for (let instance = 0; instance < held; instance += 1) {
    const row = instance * QUAD_STRIDE;
    const slot = picked.drawing[instance];
    const at = picked.order[slot];
    const pool = sources[picked.owner[slot]].pool;
    const frame = frames[picked.owner[slot]];
    const time = frame.now;
    appearance(pool, at, emitter, time, DRAWN);
    premultiplyInto(emitter, DRAWN.color);

    const age = time - pool.birthTime[at];
    const through = age01(pool, at, time);
    colorLookupInto(emitter, pool, at, through, rows, row + LOOKUP);
    rows[row + LOOKUP + 2] = erosionDrive(pool, at, emitter, time);

    for (let layer = 0; layer < TURNS.length; layer += 1) {
      const over = layerOf(emitter, layer);
      if (over === null) continue;

      uvTransformInto(pool, at, over, layer, age, through, time, UV_DRAWN);
      const turn = row + TURNS[layer];
      rows[turn] = UV_DRAWN.turn;
      rows[turn + 1] = UV_DRAWN.scaleU;
      rows[turn + 2] = UV_DRAWN.scaleV;

      const shift = row + SHIFTS[layer];
      rows[shift] = UV_DRAWN.offsetU;
      rows[shift + 1] = UV_DRAWN.offsetV;
      rows[shift + 2] = UV_DRAWN.cellU;
      rows[shift + 3] = UV_DRAWN.cellV;
    }

    drawnPlaceInto(pool, at, frame, PLACED);
    rows[row + CENTER] = PLACED.place[0] * AXIS_SIGN[0];
    rows[row + CENTER + 1] = PLACED.place[1] * AXIS_SIGN[1];
    rows[row + CENTER + 2] = PLACED.place[2] * AXIS_SIGN[2];

    /* A camera quad stretches its up with its speed, and an arbitrary quad its side. */
    const stretch = stretchOf(pool, at, emitter);
    rows[row + SIZE] = DRAWN.scale[0] * (camera ? 1 : stretch);
    rows[row + SIZE + 1] = DRAWN.scale[1] * (camera ? stretch : 1);
    rows[row + SIZE + 2] = DRAWN.scale[2];

    rows[row + COLOR] = DRAWN.color[0];
    rows[row + COLOR + 1] = DRAWN.color[1];
    rows[row + COLOR + 2] = DRAWN.color[2];
    rows[row + COLOR + 3] = DRAWN.color[3];

    /* A roll is an angle rather than a position, so the mirrored axis reaches it as a
       reversed turn about the view axis. */
    rows[row + ROLL] = -spinOf(pool, at, emitter) * DEGREE;

    if (camera && emitter.directionOriented) travelBasisInto(pool, at, BASIS);
    else particleBasisInto(pool, at, emitter, frame, BASIS);
    mirrorInto(BASIS, 0, MIRRORED, 0);
    for (let column = 0; column < 3; column += 1) {
      const basis = row + BASES[column];
      rows[basis] = MIRRORED[column];
      rows[basis + 1] = MIRRORED[3 + column];
      rows[basis + 2] = MIRRORED[6 + column];
    }
  }

  /* Uploads only the written rows, which skips most of the buffer for a sparse emitter. */
  if (held > 0) rowsWritten(buffers.rows, held);
}

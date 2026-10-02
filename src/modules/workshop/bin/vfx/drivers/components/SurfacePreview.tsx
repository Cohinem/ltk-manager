import {
  CubeIcon,
  GridNineIcon,
  MagnifyingGlassPlusIcon,
  NumberSquareOneIcon,
  NumberSquareTwoIcon,
  StackIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useFrame, useThree } from "@react-three/fiber";
import { type RefObject, use, useEffect, useMemo, useRef, useState } from "react";
import { type Mesh, type ShaderMaterial, Vector4, type WebGLRenderer } from "three";

import { Tooltip } from "@/components";
import { useDisposable } from "@/hooks";
import { m } from "@/i18n";
import { whiteTexel } from "@/modules/viewport";
import { twMerge } from "@/utils";

import { nameHash } from "../../../shared/utils/binHash";
import type { EmitterModel } from "../../engine/model/model";
import { age01, emitterPhase } from "../../engine/simulation/particleRead";
import { NOT_LINGERING } from "../../engine/simulation/pool";
import { type VfxRun, VfxRunContext } from "../../playback/state/run";
import { NO_SAMPLERS, samplersOf, useVfxTextures } from "../../rendering/hooks/useVfxTextures";
import { premultiplyInto } from "../../rendering/utils/blend";
import { drawnFor } from "../../rendering/utils/definitions";
import { drawsAsMesh, drawsAsTrail } from "../../rendering/utils/drawKind";
import { paletteScrollInto } from "../../rendering/utils/palette";
import type { UvDraw } from "../../rendering/utils/uvTransform";
import { useBackdropColor, useBackdropCss } from "../state/previewBackdrop";
import { EMITTER_PREVIEW_SIZE, NODE_PREVIEW_SIZE } from "../utils/driverLayout";
import { watchFailure } from "../utils/frameGuard";
import { emitterOf } from "../utils/graphEmitter";
import type { FileItem, StructItem } from "../utils/graphItems";
import {
  drawnLive,
  fitInto,
  type Followed,
  followedRow,
  particleInto,
  surfaceAt,
  surfaceCycle,
  surfaceDraw,
  type SurfaceDraw,
} from "../utils/surfaceDraw";
import {
  backdropMaterial,
  outlineMaterial,
  surfaceMaterial,
  TILES,
} from "../utils/surfaceMaterial";
import { EmitterLive } from "./EmitterPreview";
import { LoopedSurfacesContext } from "./graphActions";
import { FilePreview } from "./NodePreviews";
import { PreviewView } from "./PreviewView";
import { StripButton } from "./StripButton";
import { TrailSwatch } from "./TrailSwatch";

/**
 * The classes whose node previews the emitter's surface rather than its file: `textureMult`,
 * whose layer the surface multiplies in, `alphaErosionDefinition`, whose dissolve the
 * surface plays over the particle's life, and `distortionDefinition`, whose warp bends the
 * grid behind it.
 */
const SURFACED: ReadonlySet<string> = new Set(
  [
    "VfxTextureMultDefinitionData",
    "VfxAlphaErosionDefinitionData",
    "VfxDistortionDefinitionData",
  ].map((name) => nameHash(name)),
);

const DISTORTION_CLASS = nameHash("VfxDistortionDefinitionData");
const MULT_CLASS = nameHash("VfxTextureMultDefinitionData");

/**
 * How many times stronger a magnified warp draws.
 *
 * The warp is in screen widths, and a particle filling a preview box covers far more of
 * its screen than one in the game does, so the real strength moves the grid a pixel or two.
 */
const MAGNIFY = 8;

/** The texture width a surface asks for, twice the larger square for a sharp high-DPI draw. */
const TEXTURE_WIDTH = NODE_PREVIEW_SIZE * 2;

/** The chance a random value is drawn at while the timeline pins none: the middle of its range. */
const MIDDLE_CHANCE = 0.5;

/* DS-GROUND, DS-RADIUS */
const BOX =
  "my-1 flex shrink-0 flex-col self-center overflow-hidden rounded-md border border-surface-veil bg-surface-950";

/** The texture layers a surface shows: both multiplied, or one alone. */
export type Shown = "both" | "base" | "mult";

const NEXT: Record<Shown, Shown> = { both: "base", base: "mult", mult: "both" };

const SHOWN_LABEL: Record<Shown, () => string> = {
  both: m.workshop_bin_graph_surface_both_label,
  base: m.workshop_bin_graph_surface_base_label,
  mult: m.workshop_bin_graph_surface_mult_label,
};

const SHOWN_ICON = { both: StackIcon, base: NumberSquareOneIcon, mult: NumberSquareTwoIcon };

/** The strip's bar: how far through the particle's showing it is, and where its linger starts. */
interface LifeBar {
  readonly fill: RefObject<HTMLDivElement | null>;
  readonly linger: RefObject<HTMLDivElement | null>;
}

/**
 * An emitter's texture as one particle renders it, drawn by the emitter previews' canvas, or
 * for a trail or a beam the emitter itself as the viewport draws it.
 *
 * The particle draws through the renderer's own fragment pass, so its layers, ramp,
 * palette, erosion, alpha lock, alpha test and blend are the viewport's, at the particle's
 * own aspect. It is the run's own particle of the emitter at the transport's cursor, one
 * followed until it dies and then the newest, and nothing while none lives. Under
 * `LoopedSurfacesContext` it is instead one particle born when the emitter first emits and
 * reborn each life, lingering after it where the emitter lingers. A distorting emitter bends a
 * grid. The strip under it holds the particle's life as a bar, a toggle that tiles the
 * texture around the particle, and a switch between the texture layers.
 *
 * A trail's particles are the points its ribbon runs through, each alive for a moment, so
 * following one would show a quad that jumps to the next every few frames. A trail draws as
 * a flat `TrailSwatch` instead, and a beam through `EmitterLive`, framed on its bounds. A mesh
 * draws its surface as a quad does, and through `EmitterLive` while the strip's mesh switch is
 * on. The bar of either holds the emitter's own life.
 */
export function EmitterSurface({
  simple,
  listIndex,
  fluid = false,
}: {
  simple: boolean;
  listIndex: number;
  /** The box fills its container's width and draws a square, rather than the node's fixed size. */
  fluid?: boolean;
}) {
  const system = use(VfxRunContext)?.system ?? null;
  const emitter = system?.emitters.find(
    (each) => each.simple === simple && each.listIndex === listIndex,
  );
  return <SurfaceBox emitter={emitter} size={fluid ? null : EMITTER_PREVIEW_SIZE} />;
}

/** A struct node's picture: its file, or for a class of `SURFACED` its emitter's surface. */
export function StructPicture({ item, picture }: { item: StructItem; picture: FileItem }) {
  const system = use(VfxRunContext)?.system ?? null;
  const emitter = useMemo(() => emitterOf(system, item.id), [system, item.id]);
  if (item.classHash === null || !SURFACED.has(item.classHash) || emitter === undefined) {
    return <FilePreview item={picture} />;
  }

  return (
    <SurfaceBox
      emitter={emitter}
      size={NODE_PREVIEW_SIZE}
      magnify={item.classHash === DISTORTION_CLASS}
      only={item.classHash === MULT_CLASS ? "mult" : undefined}
    />
  );
}

/** One texture layer of `emitter`'s surface alone, for the node that names that layer. */
export function LayerSurface({ emitter, only }: { emitter: EmitterModel; only: "base" | "mult" }) {
  return <SurfaceBox emitter={emitter} size={NODE_PREVIEW_SIZE} only={only} />;
}

function SurfaceBox({
  emitter,
  size,
  magnify = false,
  only,
}: {
  emitter: EmitterModel | undefined;
  /** The box's side in pixels, and null for a box as wide as its container, drawing a square. */
  size: number | null;
  /** Whether the warp opens magnified, which the Distortion node's own preview does. */
  magnify?: boolean;
  /** The one layer shown, with no switch, for a node that names that layer. */
  only?: "base" | "mult";
}) {
  const [tiled, setTiled] = useState(false);
  const [magnified, setMagnified] = useState(magnify);
  const [meshShown, setMeshShown] = useState(false);
  const [picked, setShown] = useState<Shown>("both");
  const shown = only ?? picked;
  const [failure, setFailure] = useState<string | null>(null);
  const looped = use(LoopedSurfacesContext);
  const fill = useRef<HTMLDivElement>(null);
  const linger = useRef<HTMLDivElement>(null);
  const ShownIcon = SHOWN_ICON[shown];
  const mesh = emitter !== undefined && drawsAsMesh(emitter);
  const live = emitter !== undefined && (drawnLive(emitter) || (mesh && meshShown));
  const background = useBackdropCss();

  return (
    <div
      className={twMerge(BOX, size === null && "my-0 w-full")}
      style={size === null ? { background } : { width: size, height: size, background }}
    >
      <PreviewView
        className={twMerge("min-h-0 w-full", size === null ? "aspect-square" : "flex-1")}
      >
        {emitter !== undefined && live && (
          <>
            {drawsAsTrail(emitter) ? (
              <TrailSwatch emitter={emitter} shown={shown} />
            ) : (
              <EmitterLive emitter={emitter} />
            )}
            <EmitterLife emitter={emitter} bar={{ fill, linger }} />
          </>
        )}
        {emitter !== undefined && !live && (
          <SurfaceScene
            emitter={emitter}
            looped={looped}
            tiled={tiled}
            shown={shown}
            magnified={magnified}
            bar={{ fill, linger }}
            onFail={setFailure}
          />
        )}
      </PreviewView>
      <div className="flex h-5 shrink-0 items-center gap-1 border-t border-surface-veil pr-0.5 pl-1.5">
        <div
          aria-hidden
          className="relative h-1 flex-1 overflow-hidden rounded-full bg-surface-800"
        >
          <div ref={linger} className="absolute inset-y-0 right-0 left-full bg-surface-600" />
          <div
            ref={fill}
            className="absolute inset-0 origin-left bg-accent-500"
            style={{ transform: "scaleX(0)" }}
          />
        </div>
        {failure !== null && (
          <Tooltip content={m.workshop_bin_graph_surface_failed_label({ error: failure })}>
            <span
              role="img"
              aria-label={m.workshop_bin_graph_surface_failed_label({ error: failure })}
              className="flex size-4 shrink-0 items-center justify-center text-warning-text"
            >
              <WarningIcon weight="bold" className="size-3" />
            </span>
          </Tooltip>
        )}
        {!live && (
          <StripButton
            label={m.workshop_bin_graph_surface_tiles_action()}
            pressed={tiled}
            onClick={() => setTiled(!tiled)}
          >
            <GridNineIcon weight="bold" className="size-3" />
          </StripButton>
        )}
        {mesh && (
          <StripButton
            label={m.workshop_bin_graph_surface_mesh_action()}
            pressed={meshShown}
            onClick={() => setMeshShown(!meshShown)}
          >
            <CubeIcon weight="bold" className="size-3" />
          </StripButton>
        )}
        {!live && emitter?.distortion != null && (
          <StripButton
            label={m.workshop_bin_graph_surface_magnify_action({ factor: MAGNIFY })}
            pressed={magnified}
            onClick={() => setMagnified(!magnified)}
          >
            <MagnifyingGlassPlusIcon weight="bold" className="size-3" />
          </StripButton>
        )}
        {!live && only === undefined && emitter?.multTexture != null && (
          <StripButton label={SHOWN_LABEL[shown]()} onClick={() => setShown(NEXT[shown])}>
            <ShownIcon weight="bold" className="size-3" />
          </StripButton>
        )}
      </div>
    </div>
  );
}

interface SceneProps {
  emitter: EmitterModel;
  looped: boolean;
  tiled: boolean;
  shown: Shown;
  /** The warp draws `MAGNIFY` times stronger. */
  magnified: boolean;
  bar: LifeBar;
  /** Hears why the view stopped drawing, and null once it draws again. */
  onFail: (failure: string | null) => void;
}

function SurfaceScene({ emitter, looped, tiled, shown, magnified, bar, onFail }: SceneProps) {
  const run = use(VfxRunContext);
  const system = run?.system ?? null;
  const drawn = useMemo(
    () => (system === null ? [] : drawnFor(system, emitter)),
    [system, emitter],
  );
  const textures = useVfxTextures(drawn, undefined, TEXTURE_WIDTH);
  const samplers = drawn[0] === undefined ? NO_SAMPLERS : samplersOf(textures, drawn[0]);
  const material = useDisposable(() => surfaceMaterial(emitter, samplers), [emitter, samplers]);
  const outline = useDisposable(() => outlineMaterial(material), [material]);
  const backdrop = useDisposable(backdropMaterial, []);
  const draw = useMemo(surfaceDraw, []);
  const followed = useMemo<Followed>(() => ({ serial: -1 }), []);
  const particle = useRef<Mesh>(null);
  const grid = useRef<Mesh>(null);
  const ground = useBackdropColor();
  const scene = useThree((state) => state.scene);

  /* A new material is a new chance to draw, so it shows the scene a failure hid. */
  useEffect(() => {
    scene.visible = true;
    onFail(null);
    return watchFailure(scene, (error) =>
      onFail(error instanceof Error ? error.message : String(error)),
    );
  }, [scene, material, onFail]);

  useEffect(() => {
    const uniforms = material.uniforms;
    uniforms.map.value = shown === "mult" ? whiteTexel() : samplers.base;
    uniforms.mapMult.value = shown === "base" ? whiteTexel() : samplers.mult;
    uniforms.tiles.value = tiled ? TILES : 1;
    uniforms.warp.value = (emitter.distortion?.strength ?? 0) * (magnified ? MAGNIFY : 1);
  }, [material, samplers, shown, tiled, magnified, emitter]);

  useFrame(() => {
    const alive =
      run !== null &&
      (looped
        ? loopedParticle(run, emitter, draw, bar)
        : followedParticle(run, emitter, followed, draw, bar));
    scene.background = alive ? ground : null;
    if (particle.current !== null) particle.current.visible = alive;
    if (grid.current !== null) grid.current.visible = alive;
    if (!alive) return;

    premultiplyInto(emitter, draw.color);
    writeParticle(material, emitter, draw);
    if (emitter.palette !== null) {
      const scroll = material.uniforms.paletteScroll.value as number[];
      paletteScrollInto(emitter.palette, emitterPhase(emitter, run.driver.elapsed), scroll);
    }
  });

  /* The warp and the fit read the view's own rectangle, which drei sets just before the draw. */
  const place = (renderer: WebGLRenderer) => {
    renderer.getCurrentViewport(VIEW);
    const uniforms = material.uniforms;
    uniforms.viewport.value.set(VIEW.z, VIEW.w);
    uniforms.viewportOrigin.value.set(VIEW.x, VIEW.y);
    fitInto(draw.scale[0], draw.scale[1], VIEW.z, VIEW.w, uniforms.extent.value);
  };

  return (
    <>
      {emitter.distortion !== null && (
        <mesh ref={grid} frustumCulled={false} material={backdrop} renderOrder={0}>
          <planeGeometry args={[2, 2]} />
        </mesh>
      )}
      <mesh
        ref={particle}
        frustumCulled={false}
        material={material}
        renderOrder={1}
        onBeforeRender={place}
      >
        <planeGeometry args={[2, 2]} />
      </mesh>
      <lineLoop frustumCulled={false} material={outline} renderOrder={2} visible={tiled}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[OUTLINE, 3]} />
        </bufferGeometry>
      </lineLoop>
    </>
  );
}

/** The emitter's own life on the strip's bar, at the run's phase, for a surface drawn live. */
function EmitterLife({ emitter, bar }: { emitter: EmitterModel; bar: LifeBar }) {
  const run = use(VfxRunContext);
  useFrame(() => {
    showLife(bar, run === null ? 0 : emitterPhase(emitter, run.driver.elapsed), 1);
  });
  return null;
}

/** The viewport's rectangle on the canvas, in device pixels, as the draw reads it. */
const VIEW = new Vector4();

/** The particle's own square, corner to corner, in the quad's units. */
const OUTLINE = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);

/** One particle born when the emitter first emits and reborn each life, at the run's phase. */
function loopedParticle(run: VfxRun, emitter: EmitterModel, draw: SurfaceDraw, bar: LifeBar) {
  const chance = run.pinned ?? MIDDLE_CHANCE;
  const cycle = surfaceCycle(emitter, chance);
  const span = cycle.life + cycle.linger;
  const since = run.driver.elapsed - emitter.timeBeforeFirstEmission;
  const at = since > 0 ? since % span : 0;
  surfaceAt(emitter, at, cycle, chance, draw);
  showLife(bar, at / span, cycle.life / span);
  return true;
}

/** The run's own particle of the emitter the surface follows, and false while none lives. */
function followedParticle(
  run: VfxRun,
  emitter: EmitterModel,
  followed: Followed,
  draw: SurfaceDraw,
  bar: LifeBar,
) {
  const { pool, time } = run.driver;
  const row = followedRow(pool, emitter.index, followed);
  if (row < 0) {
    showLife(bar, 0, 1);
    return false;
  }

  particleInto(pool, row, emitter, time, draw);
  const from = pool.lingerFrom[row];
  const lingerFrom = from === NOT_LINGERING ? 1 : (from - pool.birthTime[row]) / pool.lifetime[row];
  showLife(bar, age01(pool, row, time), lingerFrom);
  return true;
}

/** What a quad's instanced attributes carry, written into the surface's uniforms. */
function writeParticle(material: ShaderMaterial, emitter: EmitterModel, draw: SurfaceDraw): void {
  const uniforms = material.uniforms;
  writeLayer(uniforms.particleTurn.value, uniforms.particleShift.value, draw.base);
  if (emitter.multUv !== null) {
    writeLayer(uniforms.particleTurnMult.value, uniforms.particleShiftMult.value, draw.mult);
  }
  uniforms.particleTint.value = draw.color;
  uniforms.particleLookup.value[0] = draw.lookup[0];
  uniforms.particleLookup.value[1] = draw.lookup[1];
  uniforms.particleErode.value = draw.lookup[2];
}

function writeLayer(turn: number[], shift: number[], draw: UvDraw): void {
  turn[0] = draw.turn;
  turn[1] = draw.scaleU;
  turn[2] = draw.scaleV;
  shift[0] = draw.offsetU;
  shift[1] = draw.offsetV;
  shift[2] = draw.cellU;
  shift[3] = draw.cellV;
}

function showLife(bar: LifeBar, through: number, lingerFrom: number): void {
  bar.fill.current?.style.setProperty("transform", `scaleX(${through})`);
  bar.linger.current?.style.setProperty("left", `${lingerFrom * 100}%`);
}

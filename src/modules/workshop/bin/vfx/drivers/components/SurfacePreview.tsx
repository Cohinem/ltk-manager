import {
  GridNineIcon,
  NumberSquareOneIcon,
  NumberSquareTwoIcon,
  StackIcon,
} from "@phosphor-icons/react";
import { View } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { type ReactNode, type RefObject, use, useEffect, useMemo, useRef, useState } from "react";
import { type Mesh, type ShaderMaterial, Vector4, type WebGLRenderer } from "three";

import { Tooltip } from "@/components";
import { m } from "@/i18n";
import { useSceneColors, whiteTexel } from "@/modules/viewport";

import { nameHash } from "../../../shared/utils/binHash";
import type { EmitterModel } from "../../engine/model/model";
import { age01, emitterPhase } from "../../engine/simulation/particleRead";
import { NOT_LINGERING } from "../../engine/simulation/pool";
import { type VfxRun, VfxRunContext } from "../../playback/state/run";
import { NO_SAMPLERS, samplersOf, useVfxTextures } from "../../rendering/hooks/useVfxTextures";
import { premultiplyInto } from "../../rendering/utils/blend";
import { drawnEmitters } from "../../rendering/utils/definitions";
import { paletteScrollInto } from "../../rendering/utils/palette";
import type { UvDraw } from "../../rendering/utils/uvTransform";
import { EMITTER_PREVIEW_SIZE, NODE_PREVIEW_SIZE } from "../utils/driverLayout";
import { emitterOf } from "../utils/graphEmitter";
import type { FileItem, StructItem } from "../utils/graphItems";
import {
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
import { LoopedSurfacesContext } from "./graphActions";
import { FilePreview } from "./NodePreviews";

/** `textureMult`'s class, whose node previews the emitter's surface rather than its file. */
const TEXTURE_MULT = nameHash("VfxTextureMultDefinitionData");

/** The texture width a surface asks for, twice the larger square for a sharp high-DPI draw. */
const TEXTURE_WIDTH = NODE_PREVIEW_SIZE * 2;

/** The chance a random value is drawn at while the timeline pins none: the middle of its range. */
const MIDDLE_CHANCE = 0.5;

/* DS-GROUND, DS-RADIUS */
const BOX =
  "my-1 flex shrink-0 flex-col self-center overflow-hidden rounded-md border border-surface-veil bg-surface-950";

/** The texture layers a surface shows: both multiplied, or one alone. */
type Shown = "both" | "base" | "mult";

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
 * An emitter's texture as one particle renders it, drawn by the emitter previews' canvas.
 *
 * The particle draws through the renderer's own fragment pass, so its layers, ramp,
 * palette, erosion, alpha lock, alpha test and blend are the viewport's, at the particle's
 * own aspect. It is the run's own particle of the emitter at the transport's cursor, one
 * followed until it dies and then the newest, and nothing while none lives. Under
 * `LoopedSurfacesContext` it is instead one particle born when the emitter first emits and
 * reborn each life, lingering after it where the emitter lingers. A distorting emitter bends a
 * grid. The strip under it holds the particle's life as a bar, a toggle that tiles the
 * texture around the particle, and a switch between the texture layers.
 */
export function EmitterSurface({ simple, listIndex }: { simple: boolean; listIndex: number }) {
  const system = use(VfxRunContext)?.system ?? null;
  const emitter = system?.emitters.find(
    (each) => each.simple === simple && each.listIndex === listIndex,
  );
  return <SurfaceBox emitter={emitter} size={EMITTER_PREVIEW_SIZE} />;
}

/** A struct node's picture: its file, or for a `textureMult` its emitter's surface. */
export function StructPicture({ item, picture }: { item: StructItem; picture: FileItem }) {
  const system = use(VfxRunContext)?.system ?? null;
  const emitter = useMemo(() => emitterOf(system, item.id), [system, item.id]);
  if (item.classHash !== TEXTURE_MULT || emitter === undefined) {
    return <FilePreview item={picture} />;
  }

  return <SurfaceBox emitter={emitter} size={NODE_PREVIEW_SIZE} />;
}

function SurfaceBox({ emitter, size }: { emitter: EmitterModel | undefined; size: number }) {
  const [tiled, setTiled] = useState(false);
  const [shown, setShown] = useState<Shown>("both");
  const looped = use(LoopedSurfacesContext);
  const fill = useRef<HTMLDivElement>(null);
  const linger = useRef<HTMLDivElement>(null);
  const ShownIcon = SHOWN_ICON[shown];

  return (
    <div className={BOX} style={{ width: size, height: size }}>
      <View className="min-h-0 w-full flex-1">
        {emitter !== undefined && (
          <SurfaceScene
            emitter={emitter}
            looped={looped}
            tiled={tiled}
            shown={shown}
            bar={{ fill, linger }}
          />
        )}
      </View>
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
        <StripButton
          label={m.workshop_bin_graph_surface_tiles_action()}
          pressed={tiled}
          onClick={() => setTiled(!tiled)}
        >
          <GridNineIcon weight="bold" className="h-3 w-3" />
        </StripButton>
        {emitter?.multTexture != null && (
          <StripButton label={SHOWN_LABEL[shown]()} onClick={() => setShown(NEXT[shown])}>
            <ShownIcon weight="bold" className="h-3 w-3" />
          </StripButton>
        )}
      </div>
    </div>
  );
}

function StripButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        /* DS-VEIL, DS-RADIUS */
        className="nodrag flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-sm text-surface-400 hover:bg-surface-veil hover:text-surface-100 aria-pressed:text-accent-400"
        onClick={onClick}
      >
        {children}
      </button>
    </Tooltip>
  );
}

interface SceneProps {
  emitter: EmitterModel;
  looped: boolean;
  tiled: boolean;
  shown: Shown;
  bar: LifeBar;
}

function SurfaceScene({ emitter, looped, tiled, shown, bar }: SceneProps) {
  const run = use(VfxRunContext);
  const system = run?.system ?? null;
  const drawn = useMemo(
    () => (system === null ? [] : drawnEmitters(system).filter((each) => each.emitter === emitter)),
    [system, emitter],
  );
  const textures = useVfxTextures(drawn, undefined, TEXTURE_WIDTH);
  const samplers = drawn[0] === undefined ? NO_SAMPLERS : samplersOf(textures, drawn[0]);
  const material = useMemo(() => surfaceMaterial(emitter, samplers), [emitter, samplers]);
  const outline = useMemo(() => outlineMaterial(material), [material]);
  const backdrop = useMemo(backdropMaterial, []);
  const draw = useMemo(surfaceDraw, []);
  const followed = useMemo<Followed>(() => ({ serial: -1 }), []);
  const particle = useRef<Mesh>(null);
  const colors = useSceneColors();

  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => outline.dispose(), [outline]);
  useEffect(() => () => backdrop.dispose(), [backdrop]);

  useEffect(() => {
    const uniforms = material.uniforms;
    uniforms.map.value = shown === "mult" ? whiteTexel() : samplers.base;
    uniforms.mapMult.value = shown === "base" ? whiteTexel() : samplers.mult;
    uniforms.tiles.value = tiled ? TILES : 1;
  }, [material, samplers, shown, tiled]);

  useFrame(() => {
    if (run === null) return;

    const alive = looped
      ? loopedParticle(run, emitter, draw, bar)
      : followedParticle(run, emitter, followed, draw, bar);
    if (particle.current !== null) particle.current.visible = alive;
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
      <color attach="background" args={[colors.backdrop]} />
      {emitter.distortion !== null && (
        <mesh frustumCulled={false} material={backdrop} renderOrder={0}>
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

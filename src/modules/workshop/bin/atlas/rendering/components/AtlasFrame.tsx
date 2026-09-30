import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { OrthographicCamera } from "three";

import type { FrameCommands } from "../../engine/commands/board";
import type { Screen } from "../../engine/layout/solve";
import { Composite, type CompositeColors, type ViewTransform } from "../utils/composite";
import { type FrameInputs, FrameRenderer, type ParticleDraws } from "../utils/frameRenderer";
import { renderScale } from "../utils/renderScale";

export interface AtlasFrameProps {
  /** Each frame's command list and where it sits, in screen pixels from the view's origin. */
  readonly frames: readonly FrameCommands[];
  readonly inputs: FrameInputs;
  readonly screen: Screen;
  readonly view: ViewTransform;
  readonly colors: CompositeColors;
  /** The live input every effect reads, 0 to 1. */
  readonly live: number;
  /** The clock runs. Stopped, timed effects hold at time 0. */
  readonly playing: boolean;
  /** Some command changes with the clock, which the canvas's loop follows. */
  readonly onAnimating: (animating: boolean) => void;
  /** Each element's particle system, as `AtlasParticles` keeps it. */
  readonly particles?: ParticleDraws;
}

const CAMERA = new OrthographicCamera();
const NO_PARTICLES: ParticleDraws = new Map();
/** A frame of no size, which a pass that lays the backdrop alone composites. */
const NOTHING: Screen = { width: 0, height: 0 };

/** After the claim on the shared renderer, and in place of the fibre's own render. */
const FRAME_PRIORITY = 1;

/**
 * The view's frames: each command list rendered into a target of the screen's size, then that
 * target drawn onto the canvas at its frame's place under the pan and zoom, per section 3.3 of
 * docs/plans/atlas-renderer.md. The target follows the canvas's density, per `renderScale`, so a
 * zoomed-in frame stays sharp. A frame off the canvas is not rendered.
 */
export function AtlasFrame({
  frames,
  inputs,
  screen,
  view,
  colors,
  live,
  playing,
  onAnimating,
  particles = NO_PARTICLES,
}: AtlasFrameProps) {
  const invalidate = useThree((state) => state.invalidate);
  /* Made once. A change of screen resizes the target in `setCommands`. */
  const [renderer] = useState(() => new FrameRenderer(screen));
  const [composite] = useState(() => new Composite());
  const started = useRef<number | null>(null);
  const lists = useMemo(() => frames.map((frame) => frame.commands), [frames]);

  useEffect(
    () => () => {
      renderer.dispose();
      composite.dispose();
    },
    [renderer, composite],
  );

  useLayoutEffect(() => {
    renderer.setCommands(lists, inputs, screen);
    onAnimating(renderer.animating);
    invalidate();
  }, [renderer, lists, inputs, screen, onAnimating, invalidate]);

  useLayoutEffect(() => {
    if (!playing) started.current = null;
    invalidate();
  }, [view, colors, live, playing, invalidate]);

  useFrame(({ gl, clock, size, viewport }) => {
    if (playing && started.current === null) started.current = clock.elapsedTime;
    const time = playing ? clock.elapsedTime - (started.current ?? 0) : 0;
    renderer.update(time, live);

    const autoClear = gl.autoClear;
    const maxTexture = gl.capabilities.maxTextureSize;
    renderer.setScale(renderScale(view.zoom * viewport.dpr, screen, maxTexture));
    composite.set(renderer.target.texture, NOTHING, view, size.height, viewport.dpr, colors);
    gl.setRenderTarget(null);
    gl.render(composite.scene, CAMERA);

    gl.autoClear = false;
    frames.forEach((frame, at) => {
      const placed = {
        x: view.x + frame.origin[0] * view.zoom,
        y: view.y + frame.origin[1] * view.zoom,
        zoom: view.zoom,
      };
      if (!onCanvas(placed, screen, size)) return;

      renderer.render(gl, particles, at);
      composite.set(
        renderer.target.texture,
        screen,
        placed,
        size.height,
        viewport.dpr,
        colors,
        false,
        renderer.scale,
      );
      gl.setRenderTarget(null);
      gl.render(composite.scene, CAMERA);
    });
    gl.autoClear = autoClear;
  }, FRAME_PRIORITY);

  return null;
}

/** Whether a frame of `screen` placed at `view` covers any of a canvas of `size`. */
function onCanvas(
  view: ViewTransform,
  screen: Screen,
  size: { readonly width: number; readonly height: number },
): boolean {
  return (
    view.x < size.width &&
    view.y < size.height &&
    view.x + screen.width * view.zoom > 0 &&
    view.y + screen.height * view.zoom > 0
  );
}

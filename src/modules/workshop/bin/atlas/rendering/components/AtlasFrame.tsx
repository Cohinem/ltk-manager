import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { OrthographicCamera } from "three";

import type { Command } from "../../engine/commands/types";
import type { Screen } from "../../engine/layout/solve";
import { Composite, type CompositeColors, type ViewTransform } from "../utils/composite";
import { type FrameInputs, FrameRenderer, type ParticleDraws } from "../utils/frameRenderer";

export interface AtlasFrameProps {
  readonly commands: readonly Command[];
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

/** After the claim on the shared renderer, and in place of the fibre's own render. */
const FRAME_PRIORITY = 1;

/**
 * The view's frame: the command list rendered into a target of the screen's size, then that
 * target drawn onto the canvas under the pan and zoom, per section 3.3 of
 * docs/plans/atlas-renderer.md.
 */
export function AtlasFrame({
  commands,
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

  useEffect(
    () => () => {
      renderer.dispose();
      composite.dispose();
    },
    [renderer, composite],
  );

  useLayoutEffect(() => {
    renderer.setCommands(commands, inputs, screen);
    onAnimating(renderer.animating);
    invalidate();
  }, [renderer, commands, inputs, screen, onAnimating, invalidate]);

  useLayoutEffect(() => {
    if (!playing) started.current = null;
    invalidate();
  }, [view, colors, live, playing, invalidate]);

  useFrame(({ gl, clock, size, viewport }) => {
    if (playing && started.current === null) started.current = clock.elapsedTime;
    const time = playing ? clock.elapsedTime - (started.current ?? 0) : 0;

    renderer.update(time, live);
    renderer.render(gl, particles);

    composite.set(renderer.target.texture, screen, view, size.height, viewport.dpr, colors);
    gl.setRenderTarget(null);
    gl.render(composite.scene, CAMERA);
  }, FRAME_PRIORITY);

  return null;
}

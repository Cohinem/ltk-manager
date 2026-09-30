import {
  BufferAttribute,
  BufferGeometry,
  type Camera,
  Line,
  LinearFilter,
  Mesh,
  NoColorSpace,
  OrthographicCamera,
  RGBAFormat,
  Scene,
  type Texture,
  UnsignedByteType,
  type WebGLRenderer,
  WebGLRenderTarget,
} from "three";

import type { AssetRef, UiShader } from "@/lib/tauri";
import type { ReadyProgram } from "@/modules/viewport";

import type { Command, DrawCommand, TextCommand, TextGeometry } from "../../engine/commands/types";
import { effectConstants, isTimed } from "../../engine/effects/effects";
import type { Geometry } from "../../engine/geometry/quads";
import type { PixelRect, Screen } from "../../engine/layout/solve";
import { assetKey } from "../text/fontFiles";
import type { GlyphPage } from "../text/glyphCache";
import { fontMaterial } from "./fontMaterials";
import { UI_COLOR, type UiMaterial, uiMaterial } from "./uiMaterials";

/** What the frame reads besides its commands. */
export interface FrameInputs {
  readonly programs: ReadonlyMap<UiShader, ReadyProgram>;
  /** The texture of each index of the view's textures, where it has loaded. */
  readonly textures: ReadonlyMap<number, Texture>;
  /** Drawn where a command's texture has not loaded, so the draw keeps its place. */
  readonly missing: Texture;
  /** The glyph page a text draw samples. */
  readonly glyphPage: (page: number) => GlyphPage | undefined;
  /** Each fill and icon texture a text samples, by `assetKey`, where it has loaded. */
  readonly textTextures: ReadonlyMap<string, Texture>;
  /** A fill where a font names none. */
  readonly white: Texture;
}

/** One draw as three holds it. */
interface Drawn {
  readonly command: DrawCommand;
  readonly object: Mesh | Line;
  readonly material: UiMaterial;
}

/** An element's particle system as three holds it: its scene, and the HUD camera it draws under. */
export interface ParticleDraw {
  readonly scene: Scene;
  readonly camera: Camera;
}

/** Each element's particle draw, which the canvas keeps as the systems load. */
export type ParticleDraws = ReadonlyMap<string, ParticleDraw>;

type Step =
  | { readonly kind: "run"; readonly scene: Scene; readonly scissor: PixelRect | null }
  | { readonly kind: "particles"; readonly element: string; readonly scissor: PixelRect | null }
  | { readonly kind: "push" }
  | { readonly kind: "pop"; readonly copy: Drawn; readonly scissor: PixelRect | null };

/** The camera every step renders through. A UI program writes clip space itself. */
const CAMERA: Camera = new OrthographicCamera();

const NO_PARTICLES: ParticleDraws = new Map();

/**
 * The command list as a sequence of renders into one target, per section 3.4 of
 * docs/plans/atlas-renderer.md: a run of draws that share a scissor rect is one render, and an
 * offscreen group renders into a pooled target that its pop composites through `Copy`.
 *
 * The target is the screen's size, RGBA8 without colour conversion and premultiplied, so the
 * bytes are the ones the client's gamma-space pipeline writes. A board's frames each hold a
 * list of their own and take turns in the one target.
 */
export class FrameRenderer {
  readonly target: WebGLRenderTarget;
  private frames: Step[][] = [];
  private drawn: Drawn[] = [];
  private texts: Mesh[] = [];
  private timed: Drawn[] = [];
  private readonly pool: WebGLRenderTarget[] = [];
  private screen: Screen;

  constructor(screen: Screen) {
    this.screen = screen;
    this.target = frameTarget(screen);
  }

  /** Whether a command changes with the clock. */
  get animating(): boolean {
    return (
      this.timed.length > 0 ||
      this.frames.some((steps) => steps.some((step) => step.kind === "particles"))
    );
  }

  /** The command list of each frame, replacing the last ones. */
  setCommands(frames: readonly (readonly Command[])[], inputs: FrameInputs, screen: Screen): void {
    this.disposeDrawn();
    if (screen.width !== this.screen.width || screen.height !== this.screen.height) {
      this.screen = screen;
      this.target.setSize(screen.width, screen.height);
      for (const target of this.pool) target.dispose();
      this.pool.length = 0;
    }

    let order = 0;
    for (const commands of frames) {
      const steps: Step[] = [];
      order = this.addSteps(steps, commands, inputs, order);
      this.frames.push(steps);
    }
    this.update(0, 0);
  }

  /** `commands` as steps, drawn from `order` on, answering the order after the last. */
  private addSteps(
    steps: Step[],
    commands: readonly Command[],
    inputs: FrameInputs,
    first: number,
  ): number {
    let run: Scene | null = null;
    let runScissor: PixelRect | null = null;
    let order = first;
    const openRun = (scissor: PixelRect | null): Scene => {
      if (run !== null && sameRect(runScissor, scissor)) return run;

      run = new Scene();
      runScissor = scissor;
      steps.push({ kind: "run", scene: run, scissor });
      return run;
    };

    for (const command of commands) {
      if (command.kind === "push") {
        run = null;
        steps.push({ kind: "push" });
        continue;
      }

      if (command.kind === "particles") {
        run = null;
        steps.push({ kind: "particles", element: command.element, scissor: command.scissor });
        continue;
      }

      if (command.kind === "pop") {
        run = null;
        const copy = this.drawCopy(command.rect, command.alpha, inputs);
        steps.push({ kind: "pop", copy, scissor: command.scissor });
        continue;
      }

      const object =
        command.kind === "text"
          ? this.drawText(command, inputs)
          : this.draw(command, inputs).object;
      object.renderOrder = order;
      order += 1;
      openRun(command.scissor).add(object);
    }
    return order;
  }

  /** Every timed and live constant written for `time` seconds and the live input `live`. */
  update(time: number, live: number): void {
    for (const drawn of this.drawn) {
      const { effect } = drawn.command;
      if (effect === null) continue;

      for (const [name, value] of Object.entries(effectConstants(effect, time, live))) {
        drawn.material.member(name, value);
      }
    }
  }

  /** How many frames the last `setCommands` gave. */
  get frameCount(): number {
    return this.frames.length;
  }

  /**
   * The command list of frame `frame` into the target, cleared to transparent black. A particle
   * step draws the element's system from `particles`, and nothing until it has loaded.
   */
  render(gl: WebGLRenderer, particles: ParticleDraws = NO_PARTICLES, frame = 0): void {
    const autoClear = gl.autoClear;
    gl.autoClear = false;
    const stack: WebGLRenderTarget[] = [this.target];
    clearInto(gl, this.target);

    for (const step of this.frames[frame] ?? []) {
      const top = stack[stack.length - 1] ?? this.target;
      if (step.kind === "run") {
        renderScissored(gl, top, step.scene, step.scissor, this.screen);
        continue;
      }

      if (step.kind === "particles") {
        const drawn = particles.get(step.element);
        if (drawn !== undefined) {
          renderScissored(gl, top, drawn.scene, step.scissor, this.screen, drawn.camera);
        }
        continue;
      }

      if (step.kind === "push") {
        const offscreen = this.pool.pop() ?? frameTarget(this.screen);
        clearInto(gl, offscreen);
        stack.push(offscreen);
        continue;
      }

      const offscreen = stack.pop();
      const parent = stack[stack.length - 1] ?? this.target;
      if (offscreen === undefined) continue;

      step.copy.material.texture(offscreen.texture);
      const scene = new Scene().add(step.copy.object);
      renderScissored(gl, parent, scene, step.scissor, this.screen);
      this.pool.push(offscreen);
    }

    gl.setRenderTarget(null);
    gl.autoClear = autoClear;
  }

  dispose(): void {
    this.disposeDrawn();
    this.target.dispose();
    for (const target of this.pool) target.dispose();
  }

  private draw(command: DrawCommand, inputs: FrameInputs): Drawn {
    const material = uiMaterial(
      command.shader,
      inputs.programs.get(command.shader) ?? null,
      command.blend,
    );
    const texture =
      command.texture === null
        ? inputs.missing
        : (inputs.textures.get(command.texture) ?? inputs.missing);
    material.texture(texture);

    const geometry = bufferOf(command.geometry);
    const object =
      command.primitive === "lineStrip"
        ? new Line(geometry, material.material)
        : new Mesh(geometry, material.material);
    object.frustumCulled = false;

    const drawn = { command, object, material };
    this.drawn.push(drawn);
    if (command.effect !== null && isTimed(command.effect.effect)) this.timed.push(drawn);
    return drawn;
  }

  private drawText(command: TextCommand, inputs: FrameInputs): Mesh {
    const texture = (asset: AssetRef | null | undefined) =>
      asset === null || asset === undefined ? undefined : inputs.textTextures.get(assetKey(asset));
    const page = command.glyphs.kind === "page" ? inputs.glyphPage(command.glyphs.page) : undefined;
    const glyph =
      command.glyphs.kind === "page"
        ? (page?.fill ?? inputs.missing)
        : (texture(command.glyphs.icon.texture?.asset) ?? inputs.missing);

    const material = fontMaterial(
      command,
      inputs.programs.get(command.shader) ?? null,
      this.screen,
      {
        glyph,
        outline: page?.outline ?? inputs.missing,
        fill: texture(command.fill?.asset) ?? inputs.white,
      },
    );
    const object = new Mesh(textBufferOf(command.geometry), material);
    object.frustumCulled = false;
    this.texts.push(object);
    return object;
  }

  /** The quad a pop composites its target through: the group's rect, sampled where it sits. */
  private drawCopy(rect: PixelRect, alpha: number, inputs: FrameInputs): Drawn {
    const { width, height } = this.screen;
    const x0 = rect.x / width;
    const y0 = rect.y / height;
    const x1 = (rect.x + rect.w) / width;
    const y1 = (rect.y + rect.h) / height;
    /* A target's first row is the bottom of the screen, where a sprite's is the top. */
    const geometry: Geometry = {
      positions: [x0, y0, x1, y0, x0, y1, x1, y1],
      colors: new Array<number>(16).fill(255),
      texcoords: [x0, 1 - y0, 0, 0, x1, 1 - y0, 1, 0, x0, 1 - y1, 0, 1, x1, 1 - y1, 1, 1],
      indices: [0, 2, 1, 1, 2, 3],
    };
    const material = uiMaterial("copy", inputs.programs.get("copy") ?? null, "premultiplied");
    material.member(UI_COLOR, [1, 1, 1, alpha]);
    const object = new Mesh(bufferOf(geometry), material.material);
    object.frustumCulled = false;

    const drawn: Drawn = {
      command: {
        kind: "draw",
        shader: "copy",
        texture: null,
        geometry,
        primitive: "triangles",
        blend: "premultiplied",
        effect: null,
        scissor: null,
        element: "",
      },
      object,
      material,
    };
    this.drawn.push(drawn);
    return drawn;
  }

  private disposeDrawn(): void {
    for (const drawn of this.drawn) {
      drawn.object.geometry.dispose();
      drawn.material.material.dispose();
    }
    for (const text of this.texts) {
      text.geometry.dispose();
      if (!Array.isArray(text.material)) text.material.dispose();
    }
    this.drawn = [];
    this.texts = [];
    this.timed = [];
    this.frames = [];
  }
}

/**
 * A target of the screen's size. No mips, since three would regenerate them after every run, and
 * the composite filters a zoomed-out frame itself.
 */
function frameTarget(screen: Screen): WebGLRenderTarget {
  return new WebGLRenderTarget(screen.width, screen.height, {
    format: RGBAFormat,
    type: UnsignedByteType,
    colorSpace: NoColorSpace,
    depthBuffer: false,
    generateMipmaps: false,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
  });
}

function clearInto(gl: WebGLRenderer, target: WebGLRenderTarget): void {
  gl.setRenderTarget(target);
  gl.setClearColor(0x000000, 0);
  gl.clear(true, false, false);
}

/** `scene` into `target` clipped to `scissor`, which a target takes with a bottom-left origin. */
function renderScissored(
  gl: WebGLRenderer,
  target: WebGLRenderTarget,
  scene: Scene,
  scissor: PixelRect | null,
  screen: Screen,
  camera: Camera = CAMERA,
): void {
  target.scissorTest = scissor !== null;
  if (scissor !== null) {
    target.scissor.set(scissor.x, screen.height - scissor.y - scissor.h, scissor.w, scissor.h);
  }
  gl.setRenderTarget(target);
  gl.render(scene, camera);
  target.scissorTest = false;
}

function sameRect(a: PixelRect | null, b: PixelRect | null): boolean {
  if (a === null || b === null) return a === b;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function bufferOf(geometry: Geometry): BufferGeometry {
  const buffer = new BufferGeometry();
  buffer.setAttribute("a_POSITION", new BufferAttribute(new Float32Array(geometry.positions), 2));
  buffer.setAttribute("a_COLOR", new BufferAttribute(new Uint8Array(geometry.colors), 4, true));
  buffer.setAttribute("a_TEXCOORD", new BufferAttribute(new Float32Array(geometry.texcoords), 4));
  buffer.setIndex(geometry.indices);
  return buffer;
}

function textBufferOf(geometry: TextGeometry): BufferGeometry {
  const buffer = new BufferGeometry();
  buffer.setAttribute("a_POSITION", new BufferAttribute(new Float32Array(geometry.positions), 2));
  buffer.setAttribute("a_COLOR", new BufferAttribute(new Uint8Array(geometry.colors), 4, true));
  buffer.setAttribute("a_TEXCOORD", new BufferAttribute(new Float32Array(geometry.texcoords), 2));
  buffer.setAttribute(
    "a_TEXCOORD1",
    new BufferAttribute(new Float32Array(geometry.fillTexcoords), 2),
  );
  buffer.setIndex(geometry.indices);
  return buffer;
}

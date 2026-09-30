import {
  BufferAttribute,
  BufferGeometry,
  type Color,
  GLSL3,
  Mesh,
  RawShaderMaterial,
  Scene,
  SRGBColorSpace,
  type Texture,
  Vector2,
  Vector3,
} from "three";

import type { Screen } from "../../engine/layout/solve";

/** Where the frame sits on the canvas: the canvas point of its top-left corner, and the zoom. */
export interface ViewTransform {
  readonly x: number;
  readonly y: number;
  /** Canvas pixels per screen pixel. */
  readonly zoom: number;
}

/** The composite's colours, the pane's ground and the two squares of the checker behind the frame. */
export interface CompositeColors {
  readonly backdrop: Color;
  readonly checkerA: Color;
  readonly checkerB: Color;
}

/** Canvas pixels per square of the checker that shows through transparent parts of the frame. */
const CHECKER = 8;

const VERTEX = `
in vec3 position;

void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/*
 * Past 100% a canvas pixel takes the screen pixel under it, so the frame shows its real pixels.
 * Below it, a grid of taps over the canvas pixel's footprint stands in for the mips the target
 * does not carry.
 */
const FRAGMENT = `
precision highp float;
uniform sampler2D u_frame;
uniform vec2 u_frameSize;
uniform vec2 u_offset;
uniform float u_zoom;
uniform float u_canvasHeight;
uniform vec3 u_backdrop;
uniform vec3 u_checkerA;
uniform vec3 u_checkerB;
uniform bool u_ground;
out vec4 fragment;

vec4 frameAt(vec2 at) {
  return texture(u_frame, vec2(at.x / u_frameSize.x, 1.0 - at.y / u_frameSize.y));
}

void main() {
  vec2 canvas = vec2(gl_FragCoord.x, u_canvasHeight - gl_FragCoord.y);
  vec2 at = (canvas - u_offset) / u_zoom;
  if (at.x < 0.0 || at.y < 0.0 || at.x >= u_frameSize.x || at.y >= u_frameSize.y) {
    if (!u_ground) discard;
    fragment = vec4(u_backdrop, 1.0);
    return;
  }

  vec2 cell = floor(canvas / ${CHECKER.toFixed(1)});
  vec3 ground = mod(cell.x + cell.y, 2.0) < 1.0 ? u_checkerA : u_checkerB;

  vec4 texel;
  if (u_zoom >= 1.0) {
    texel = frameAt(floor(at) + 0.5);
  } else {
    float footprint = 1.0 / u_zoom;
    texel = vec4(0.0);
    for (int i = 0; i < 4; i++) {
      for (int j = 0; j < 4; j++) {
        texel += frameAt(at + (vec2(float(i), float(j)) - 1.5) * footprint * 0.25);
      }
    }
    texel /= 16.0;
  }
  fragment = vec4(texel.rgb + (1.0 - texel.a) * ground, 1.0);
}
`;

/**
 * The one triangle that covers the canvas, with the frame drawn over the checker. A pass that
 * lays no ground leaves the canvas outside its frame as the passes before it drew it.
 */
export class Composite {
  readonly scene = new Scene();
  private readonly material: RawShaderMaterial;

  constructor() {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
    );
    this.material = new RawShaderMaterial({
      name: "atlas:composite",
      glslVersion: GLSL3,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        u_frame: { value: null },
        u_frameSize: { value: new Vector2() },
        u_offset: { value: new Vector2() },
        u_zoom: { value: 1 },
        u_canvasHeight: { value: 1 },
        u_backdrop: { value: new Vector3() },
        u_checkerA: { value: new Vector3() },
        u_checkerB: { value: new Vector3() },
        u_ground: { value: true },
      },
    });
    const mesh = new Mesh(geometry, this.material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  /**
   * The uniforms for one draw. `dpr` takes the CSS-pixel `view` to the canvas's own pixels, and
   * `ground` paints the backdrop around the frame.
   */
  set(
    frame: Texture,
    screen: Screen,
    view: ViewTransform,
    canvasHeight: number,
    dpr: number,
    colors: CompositeColors,
    ground = true,
  ): void {
    const uniforms = this.material.uniforms;
    uniforms.u_frame = { value: frame };
    (uniforms.u_frameSize?.value as Vector2).set(screen.width, screen.height);
    (uniforms.u_offset?.value as Vector2).set(view.x * dpr, view.y * dpr);
    uniforms.u_zoom = { value: view.zoom * dpr };
    uniforms.u_canvasHeight = { value: canvasHeight * dpr };
    uniforms.u_ground = { value: ground };
    writeColor(uniforms.u_backdrop?.value as Vector3, colors.backdrop);
    writeColor(uniforms.u_checkerA?.value as Vector3, colors.checkerA);
    writeColor(uniforms.u_checkerB?.value as Vector3, colors.checkerB);
  }

  dispose(): void {
    for (const child of this.scene.children) {
      if (child instanceof Mesh) child.geometry.dispose();
    }
    this.material.dispose();
  }
}

/** A token's colour as the sRGB bytes the canvas shows, since the composite converts nothing. */
function writeColor(target: Vector3, color: Color): void {
  const rgb = { r: 0, g: 0, b: 0 };
  color.getRGB(rgb, SRGBColorSpace);
  target.set(rgb.r, rgb.g, rgb.b);
}

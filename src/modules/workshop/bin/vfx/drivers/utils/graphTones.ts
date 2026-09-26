import type { DriverKind, SupportLevel } from "../../engine/drivers/node";
import type { GraphItem } from "./systemGraph";

/** Each kind as the bin format's own type names write it. */
export const KIND_NAME: Readonly<Record<DriverKind, string>> = {
  float: "F32",
  vec2: "Vec2",
  vec3: "Vec3",
  vec4: "Vec4",
};

/** The socket scale of each kind, as classes. DS-KIND-HUE. */
export const KIND_TONE: Readonly<Record<DriverKind, { fill: string; text: string; edge: string }>> =
  {
    float: {
      fill: "bg-socket-float!",
      text: "text-socket-float-text",
      edge: "border-t-socket-float",
    },
    vec2: { fill: "bg-socket-vec2!", text: "text-socket-vec2-text", edge: "border-t-socket-vec2" },
    vec3: { fill: "bg-socket-vec3!", text: "text-socket-vec3-text", edge: "border-t-socket-vec3" },
    vec4: { fill: "bg-socket-vec4!", text: "text-socket-vec4-text", edge: "border-t-socket-vec4" },
  };

/** The fill of a socket that carries no value kind: an emitter's or a component's. */
export const NEUTRAL_SOCKET = "bg-surface-400!";

/** The chip of each trust level a driver node marks. DS-TEXT. */
export const LEVEL_TONE: Readonly<Record<Exclude<SupportLevel, "attested">, string>> = {
  inferred: "bg-info/15 text-info-text",
  unsupported: "bg-warning/15 text-warning-text",
};

/** Each kind's socket token, which an edge carrying the kind strokes in. */
export const KIND_STROKE: Readonly<Record<DriverKind, string>> = {
  float: "var(--color-socket-float)",
  vec2: "var(--color-socket-vec2)",
  vec3: "var(--color-socket-vec3)",
  vec4: "var(--color-socket-vec4)",
};

export const NEUTRAL_STROKE = "var(--color-surface-500)";

export const EDGE_TRANSITION = "opacity 120ms, stroke-width 120ms";

/** The canvas's own colours: its dot grid, and the minimap's ground and mask. */
export const CANVAS_TONE = {
  dots: "var(--color-surface-700)",
  minimap: "var(--color-surface-900)",
  mask: "color-mix(in srgb, var(--color-surface-950) 60%, transparent)",
} as const;

/** The minimap colour of each role that carries no value kind. */
const ROLE_STROKE = {
  emitter: "var(--color-accent-500)",
  component: "var(--color-bin-class)",
} as const;

/** The colour an item takes in the minimap: its role, or a driver's output kind. */
export function minimapTone(item: GraphItem): string {
  switch (item.type) {
    case "preview":
    case "emitter":
      return ROLE_STROKE.emitter;
    case "component":
      return ROLE_STROKE.component;
    case "driver":
      return KIND_STROKE[item.node.kind];
  }
}

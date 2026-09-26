import type { AssetRef, VfxValue } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import { compileDriver } from "../../engine/drivers/compileDriver";
import type { DriverKind } from "../../engine/drivers/node";
import { readDriver } from "../../engine/drivers/readDriver";
import { graphRootKind } from "../../engine/drivers/registry";
import { field, flag, text } from "../../engine/parsing/readValue";

const SHIMMER_LIST = nameHash("shimmerEmitterDefinitionData");

const EMITTER = {
  name: nameHash("emitterName"),
  disabled: nameHash("disabled"),
  components: nameHash("VfxComponents"),
} as const;

const SLOT = {
  physics: nameHash("PhysicsComponent"),
  render: nameHash("RenderComponent"),
  geometry: nameHash("GeometryComponent"),
} as const;

const MESH_EXTENSIONS = [".gmesh", ".tmesh", ".scb"] as const;
const TEXTURE_EXTENSIONS = [".tex", ".dds"] as const;

/** The depth past which the walk for assets and graphs stops. */
const MAX_DEPTH = 24;

/** A three-component value, or four for a colour. */
type Triple = readonly [number, number, number];
type Quad = readonly [number, number, number, number];

/** One shimmer emitter as a single mesh at rest, until a component runtime spawns it. */
export interface ShimmerMesh {
  /** Its place in `shimmerEmitterDefinitionData`. */
  readonly index: number;
  readonly name: string;
  readonly disabled: boolean;
  readonly mesh: { readonly asset: AssetRef; readonly path: string };
  readonly texture: AssetRef | null;
  readonly color: Quad;
  readonly scale: Triple;
  /** In the engine's own space, which the draw mirrors as the particles' is. */
  readonly offset: Triple;
  /** Degrees about each axis. */
  readonly rotation: Triple;
}

/**
 * Every shimmer emitter of a resolved system that names a mesh, as the mesh drawn once.
 *
 * The geometry component's primitive holds a mesh path and a texture name under fields no
 * table names reliably, so each is the first asset under it with the extension the engine
 * tests. The colour, the scale, the offset and the rotation are the constant driver graphs
 * of those names under the render and physics components. The field names are what the
 * Hall of Legends cube grid writes, and a graph that is not constant leaves its default.
 */
export function shimmerMeshesOf(root: VfxValue): ShimmerMesh[] {
  const list = field(root, SHIMMER_LIST);
  if (list?.type !== "container") return [];

  return list.items.flatMap((emitter, index) => {
    const components = field(emitter, EMITTER.components);
    const geometry = field(components, SLOT.geometry);
    const render = field(components, SLOT.render);
    const physics = field(components, SLOT.physics);

    const mesh = firstAsset(geometry, MESH_EXTENSIONS, 0);
    if (mesh === null || mesh.asset === null) return [];

    const graphs = [...namedGraphs(render, 0), ...namedGraphs(physics, 0)];
    const constant = <T>(name: RegExp, kind: DriverKind, fallback: T): T => {
      const graph = graphs.find((each) => name.test(each.name) && each.kind === kind);
      if (graph === undefined) return fallback;

      const compiled = compileDriver(readDriver(graph.value, kind, graph.name).node, {
        scope: "emitter",
      });
      return compiled.constant === null ? fallback : (Array.from(compiled.constant) as T);
    };

    return [
      {
        index,
        name: text(field(emitter, EMITTER.name)) ?? `[${index}]`,
        disabled: flag(field(emitter, EMITTER.disabled)),
        mesh: { asset: mesh.asset, path: mesh.path },
        texture:
          firstAsset(geometry, TEXTURE_EXTENSIONS, 0)?.asset ??
          firstAsset(render, TEXTURE_EXTENSIONS, 0)?.asset ??
          null,
        color: constant<Quad>(/Color$/i, "vec4", [1, 1, 1, 1]),
        scale: constant<Triple>(/Scale$/i, "vec3", [1, 1, 1]),
        offset: constant<Triple>(/(Position|Offset|Translation)$/i, "vec3", [0, 0, 0]),
        rotation: constant<Triple>(/Rotation$/i, "vec3", [0, 0, 0]),
      },
    ];
  });
}

/** The first asset under `value` whose path ends in one of `extensions`, depth first. */
function firstAsset(
  value: VfxValue | null,
  extensions: readonly string[],
  depth: number,
): { path: string; asset: AssetRef | null } | null {
  if (value === null || depth > MAX_DEPTH) return null;

  if (value.type === "asset" || value.type === "string") {
    const path = value.type === "asset" ? value.path : value.value;
    const lower = path.toLowerCase();
    if (!extensions.some((extension) => lower.endsWith(extension))) return null;
    return { path, asset: value.type === "asset" ? value.asset : null };
  }

  const children =
    value.type === "struct"
      ? value.fields.map((each) => each.value)
      : value.type === "container"
        ? value.items
        : value.type === "map"
          ? value.entries.map((entry) => entry.value)
          : [];
  for (const child of children) {
    const found = firstAsset(child, extensions, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

/** Every driver graph under `value`, by the name of the field that holds it. */
function namedGraphs(
  value: VfxValue | null,
  depth: number,
): { name: string; kind: DriverKind; value: VfxValue }[] {
  if (value === null || depth > MAX_DEPTH) return [];

  if (value.type === "container")
    return value.items.flatMap((item) => namedGraphs(item, depth + 1));
  if (value.type !== "struct") return [];

  return value.fields.flatMap(({ name, value: held }) => {
    const kind = held.type === "struct" ? graphRootKind(held.classHash) : null;
    if (kind !== null && name !== null) return [{ name, kind, value: held }];
    return namedGraphs(held, depth + 1);
  });
}

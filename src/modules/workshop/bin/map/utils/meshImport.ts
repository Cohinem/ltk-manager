import type {
  MapGeometryEdit,
  MaterialImport,
  MaterialTemplate,
  ModelSummary,
  UpAxis,
} from "@/lib/tauri";

/** What an import does for one material of the model file. */
export type MaterialChoice =
  | {
      readonly mode: "create";
      /** The entry path of the new `StaticMaterialDef`. */
      readonly name: string;
      readonly template: MaterialTemplate;
      /** An image file that replaces the model's texture, and null for the model's own. */
      readonly texture: string | null;
    }
  | { readonly mode: "use"; readonly material: string };

/** Where the new meshes stand, in the engine's space. */
export type Placement = "origin" | "center" | "drop";

/** The choices of the import dialog. */
export interface MeshImportOptions {
  /** The meshes of the file to add, by index. */
  readonly meshes: readonly number[];
  readonly scale: number;
  readonly up: UpAxis;
  /** One choice per material of the file, by index. */
  readonly materials: readonly MaterialChoice[];
  readonly visibility: number;
  /** The controller, `0x` and eight hex digits, or null for none. */
  readonly controller: string | null;
  /** The point the meshes stand at, and null for the file's origin. */
  readonly at: readonly [number, number, number] | null;
}

/** A mesh transform as the import edit takes it. */
export type MeshImportTransform = Extract<MapGeometryEdit, { kind: "import" }>["transform"];

/** Every visibility layer, one bit each. */
export const ALL_LAYERS = 0xff;

/** Characters an entry path segment keeps. Others become `_`. */
const SEGMENT = /[^A-Za-z0-9_-]/g;

/** The segment of a source material that has no name. */
const UNNAMED_SEGMENT = "Material";

/**
 * Returns `<map>/Materials/<source>`, with a number appended to the last segment while `taken`
 * holds the path, compared lowercased.
 */
export function newMaterialName(map: string, source: string, taken: ReadonlySet<string>): string {
  const stem = `${map}/Materials/${source.replace(SEGMENT, "_") || UNNAMED_SEGMENT}`;
  let name = stem;
  for (let count = 2; taken.has(name.toLowerCase()); count += 1) name = `${stem}${count}`;
  return name;
}

/**
 * Returns a Create choice for each material of `summary`, named under `map` apart from the
 * paths `existing` holds and from each other. A material with alpha takes the alpha-tested
 * template.
 */
export function defaultMaterialChoices(
  summary: ModelSummary,
  map: string,
  existing: readonly string[],
): MaterialChoice[] {
  const taken = new Set(existing.map((path) => path.toLowerCase()));
  return summary.materials.map((material) => {
    const name = newMaterialName(map, material.name, taken);
    taken.add(name.toLowerCase());
    return {
      mode: "create",
      name,
      template: material.alpha ? "flatAlphaTest" : "flat",
      texture: null,
    };
  });
}

/** Returns the materials that `choices` create from the model file at `source`. */
export function materialImports(
  source: string,
  choices: readonly MaterialChoice[],
): MaterialImport[] {
  return choices.flatMap((choice, material) =>
    choice.mode === "create"
      ? [
          {
            name: choice.name,
            template: choice.template,
            model: source,
            material,
            texture: choice.texture,
          },
        ]
      : [],
  );
}

/** Returns the column-major transform that moves a mesh to `at`, or the identity for null. */
export function placementTransform(
  at: readonly [number, number, number] | null,
): MeshImportTransform {
  const [x, y, z] = at ?? [0, 0, 0];
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

/** Returns the `.mapgeo` edit that adds the meshes of the model file at `source`. */
export function importEdit(source: string, options: MeshImportOptions): MapGeometryEdit {
  return {
    kind: "import",
    source,
    meshes: [...options.meshes],
    scale: options.scale,
    up: options.up,
    materials: options.materials.map((choice) =>
      choice.mode === "create" ? choice.name : choice.material,
    ),
    visibility: options.visibility,
    controller: options.controller,
    transform: placementTransform(options.at),
  };
}

/** The extensions of the model files that the importer reads. */
export const MODEL_EXTENSIONS = ["gltf", "glb", "fbx", "obj", "nvr"] as const;

/** Whether `path` names a model file that the importer reads. */
export function isModelPath(path: string): boolean {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return (MODEL_EXTENSIONS as readonly string[]).includes(extension);
}

/** Model file and target map mesh of a reimport. */
export interface ReimportRequest {
  readonly mesh: number;
  readonly path: string;
  readonly summary: ModelSummary;
  /** Index of the matched source mesh. `null` if no mesh matches. */
  readonly source: number | null;
}

/** Returns the `.mapgeo` edit that replaces the mesh of `request` with the file's `sourceMesh`. */
export function reimportEdit(
  request: ReimportRequest,
  sourceMesh: number,
  scale: number,
  up: UpAxis,
): MapGeometryEdit {
  return { kind: "reimport", mesh: request.mesh, source: request.path, sourceMesh, scale, up };
}

/** Positions and indices of the import preview. */
export interface ModelPreview {
  /** Three floats per vertex, in engine space. */
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
}

/**
 * Reads the buffer that `preview_buffer` in `crates/ltk-manager-assets/src/map_import.rs`
 * writes. Returns empty arrays for a buffer shorter than its counts.
 */
export function readModelPreview(buffer: ArrayBuffer): ModelPreview {
  const header = new Uint32Array(buffer, 0, Math.min(2, buffer.byteLength >> 2));
  const vertices = header[0] ?? 0;
  const indices = header[1] ?? 0;
  if (buffer.byteLength < 8 + 4 * (vertices * 3 + indices)) {
    return { positions: new Float32Array(0), indices: new Uint32Array(0) };
  }

  return {
    positions: new Float32Array(buffer, 8, vertices * 3),
    indices: new Uint32Array(buffer, 8 + 12 * vertices, indices),
  };
}

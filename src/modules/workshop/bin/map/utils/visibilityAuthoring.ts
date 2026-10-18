import type {
  LeafValue,
  MapChunk,
  MapGeometryMesh,
  ObjectCreation,
  PropertyEdit,
  ValueEdit,
} from "@/lib/tauri";

import { nameHash } from "../../shared/utils/binHash";
import { itemId } from "./mapOutline";
import { meshId, meshIndexOf } from "./meshSelection";
import type { PlaceableRef } from "./placeableEdits";

/** `MapPlaceableContainer.items`. */
const ITEMS = nameHash("items");
/** `VisibilityController`, which each placeable class declares under this name. */
const VISIBILITY_CONTROLLER = nameHash("VisibilityController");
/** `IMapVisibilityController.PathHash`, which a shipped controller sets to its own path hash. */
const PATH_HASH = nameHash("PathHash");
const NAME = nameHash("name");
const DEFAULT_VISIBLE = nameHash("DefaultVisible");
/** The unnamed terrain mask byte of `0xc406a533`. */
const TERRAIN_MASK = "0x27639032";
/** The unnamed session mask byte of `0xec733fe2`. */
const STAGE_MASK = "0x8bff8cdf";
const PARENTS = nameHash("Parents");
const PARENT_MODE = nameHash("ParentMode");
const MUTATOR_NAME = nameHash("MutatorName");
const VIS_FLAGS = nameHash("VisFlags");

/** The link value of no controller. */
const NO_LINK = "0x00000000";

/** A layer mask that draws a mesh without a controller on every layer. */
const EVERY_LAYER = 0xff;

/** The controller kinds that New controller creates, per "Visibility" in docs/ux/MAP_EDITOR.md. */
export const CONTROLLER_KINDS = [
  "named",
  "terrain",
  "stage",
  "child",
  "mutator",
  "layer",
  "driver",
] as const;

export type ControllerKind = (typeof CONTROLLER_KINDS)[number];

/** The class of each controller kind, as a name or `0x` and eight hex digits. */
export const CONTROLLER_CLASSES: Record<ControllerKind, string> = {
  named: "0xe07edfa4",
  terrain: "0xc406a533",
  stage: "0xec733fe2",
  child: "ChildMapVisibilityController",
  mutator: "MutatorMapVisibilityController",
  layer: "LegacyVisFlagVisController",
  driver: "LogicDriverVisibilityController",
};

/** The `ParentMode` values that the client defines, in value order. */
export const PARENT_MODES = [0, 1, 2, 3] as const;

/** The fields of a new controller. Each kind reads the fields of its class and ignores the rest. */
export interface NewController {
  readonly kind: ControllerKind;
  /** The server name of a named controller, hashed into its `name`. */
  readonly name: string;
  readonly defaultVisible: boolean;
  /** The byte of a terrain, a stage or a legacy flag controller. */
  readonly mask: number;
  /** The path hashes of a child controller's parents. */
  readonly parents: readonly string[];
  readonly mode: number;
  readonly mutator: string;
}

/** The selection ids of `selected` split into mesh indices and placeables. */
export function splitSelection(selected: Iterable<string>): {
  meshes: number[];
  placeables: PlaceableRef[];
} {
  const meshes: number[] = [];
  const placeables: PlaceableRef[] = [];

  for (const id of selected) {
    const index = meshIndexOf(id);
    if (index !== null) {
      meshes.push(index);
      continue;
    }

    const slash = id.lastIndexOf("/");
    if (slash > 0) placeables.push({ chunk: id.slice(0, slash), key: id.slice(slash + 1) });
  }

  return { meshes, placeables };
}

function leafEdit(entry: string, field: string, value: LeafValue, holder = ""): PropertyEdit {
  return {
    entry,
    holder,
    field,
    edits: [{ type: "setLeaf", path: "", value }],
  };
}

function integer(value: number): LeafValue {
  return { type: "integer", text: String(value) };
}

/** Returns the edits that set the `VisibilityController` of each of `refs` to `controller`, or to none. */
export function placeableControllerEdits(
  refs: readonly PlaceableRef[],
  controller: string | null,
): PropertyEdit[] {
  const value: LeafValue = { type: "objectLink", text: controller ?? NO_LINK };

  return refs.map((ref) =>
    leafEdit(ref.chunk, VISIBILITY_CONTROLLER, value, `${ITEMS.slice(2)}{${ref.key.slice(2)}}`),
  );
}

/** Returns the edit that replaces the `Parents` of the child controller `entry`, which holds `held` parents. */
function parentsEdit(entry: string, held: number, parents: readonly string[]): PropertyEdit {
  const edits: ValueEdit[] = [];
  for (let index = held - 1; index >= 0; index -= 1) {
    edits.push({ type: "removeItem", path: `[${index}]` });
  }

  parents.forEach((parent, index) => {
    edits.push({
      type: "insertItem",
      path: "",
      item: { index: null, key: null, class: null },
    });
    edits.push({
      type: "setLeaf",
      path: `[${index}]`,
      value: { type: "objectLink", text: parent },
    });
  });

  return { entry, holder: "", field: PARENTS, edits };
}

/**
 * Returns the edits that set the `Parents` and `ParentMode` of the child controller `entry`.
 * `held` is how many parents it holds now.
 */
export function childEdits(
  entry: string,
  held: number,
  parents: readonly string[],
  mode: number,
): PropertyEdit[] {
  return [parentsEdit(entry, held, parents), leafEdit(entry, PARENT_MODE, integer(mode))];
}

/**
 * Returns the object that creates `controller` at the object path `path`, and the edits that
 * fill its fields. A logic driver controller is created with no driver.
 */
export function controllerCreation(
  path: string,
  controller: NewController,
): { entry: string; objects: ObjectCreation[]; edits: PropertyEdit[] } {
  const entry = nameHash(path);
  const objects: ObjectCreation[] = [
    {
      name: path,
      origin: { type: "class", class: CONTROLLER_CLASSES[controller.kind] },
    },
  ];
  const edits: PropertyEdit[] = [leafEdit(entry, PATH_HASH, { type: "hash", text: entry })];

  switch (controller.kind) {
    case "named":
    case "terrain":
    case "stage":
      edits.push(leafEdit(entry, NAME, { type: "hash", text: controller.name }));
      edits.push(
        leafEdit(entry, DEFAULT_VISIBLE, {
          type: "bool",
          value: controller.defaultVisible,
        }),
      );
      if (controller.kind === "terrain") {
        edits.push(leafEdit(entry, TERRAIN_MASK, integer(controller.mask)));
      }
      if (controller.kind === "stage") {
        edits.push(leafEdit(entry, STAGE_MASK, integer(controller.mask)));
      }
      break;
    case "child":
      edits.push(...childEdits(entry, 0, controller.parents, controller.mode));
      break;
    case "mutator":
      edits.push(
        leafEdit(entry, MUTATOR_NAME, {
          type: "string",
          value: controller.mutator,
        }),
      );
      break;
    case "layer":
      edits.push(leafEdit(entry, VIS_FLAGS, integer(controller.mask)));
      break;
    case "driver":
      break;
  }

  return { entry, objects, edits };
}

/** The selection ids of the meshes of `meshes` under `controller`. */
export function controllerMeshIds(
  meshes: readonly MapGeometryMesh[],
  controller: string,
): string[] {
  return meshes.filter((mesh) => mesh.controller === controller).map((mesh) => meshId(mesh.index));
}

/** The selection ids of the placeables of `chunks` under `controller`. */
export function controllerPlaceableIds(chunks: readonly MapChunk[], controller: string): string[] {
  return chunks.flatMap((chunk) =>
    chunk.items
      .filter((item) => item.controller === controller)
      .map((item) => itemId(chunk.entry, item.key)),
  );
}

/**
 * The ids that isolating `controller` hides and shows. It hides every mesh and placeable under
 * another controller and shows the ones under `controller`. Objects with no controller are in
 * neither list.
 */
export function isolation(
  meshes: readonly MapGeometryMesh[],
  chunks: readonly MapChunk[],
  controller: string,
): { hide: string[]; show: string[] } {
  const hide: string[] = [];
  const show: string[] = [];

  for (const mesh of meshes) {
    if (mesh.controller === null) continue;
    (mesh.controller === controller ? show : hide).push(meshId(mesh.index));
  }

  for (const chunk of chunks) {
    for (const item of chunk.items) {
      if (item.controller === null) continue;
      (item.controller === controller ? show : hide).push(itemId(chunk.entry, item.key));
    }
  }

  return { hide, show };
}

/**
 * The selection ids of the meshes that the layer `index` decides: no controller, and a mask
 * that holds the layer's bit and is not every layer. ADR-0064.
 */
export function layerMeshIds(meshes: readonly MapGeometryMesh[], index: number): string[] {
  const bit = 1 << index;

  return meshes
    .filter(
      (mesh) =>
        mesh.controller === null &&
        mesh.visibility !== EVERY_LAYER &&
        (mesh.visibility & bit) !== 0,
    )
    .map((mesh) => meshId(mesh.index));
}

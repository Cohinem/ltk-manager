/**
 * The objects that the project's game data declarations create, remove or edit, joined into what
 * the objects views draw.
 *
 * Pure. "Declared objects" in docs/ux/PROJECT_EDITOR.md.
 */

import type {
  IndexResponse,
  ModuleObject,
  ObjectDeclaration,
  ObjectFindHit,
  SearchHits,
  WorkshopProject,
} from "@/lib/tauri";

import { layerTitle } from "../../documents/utils/contentDocument";
import { splitClassTerm } from "../../palette/utils/classTerm";
import type { LayerDeclaration, LayerDeclarations, ModuleMark } from "./objectTree";
import type { ProjectObject } from "./projectObjects";

export const NO_MODULE_OBJECTS: readonly ModuleObject[] = [];

/** `layers` with what each module of `objects` does added after the layer files' declarations. */
export function withModuleDeclarations(
  layers: LayerDeclarations,
  objects: readonly ModuleObject[],
  project: WorkshopProject,
): LayerDeclarations {
  if (objects.length === 0) return layers;

  const joined = new Map<string, LayerDeclaration[]>();
  for (const [hash, declared] of layers) joined.set(hash, [...declared]);

  for (const object of objects) {
    const declared: LayerDeclaration = {
      declaration: object.action.kind === "create" ? object.action.declaration : null,
      layer: { name: object.layer, title: layerTitle(project, object.layer) },
      module: moduleMark(object),
    };
    const known = joined.get(object.objectHash);
    if (known) known.push(declared);
    else joined.set(object.objectHash, [declared]);
  }

  return joined;
}

/** The objects a module of `objects` creates, once each, with the path the module spells. */
export function createdObjects(objects: readonly ModuleObject[]): ProjectObject[] {
  const created = new Map<string, ProjectObject>();
  for (const object of objects) {
    if (object.action.kind !== "create" || created.has(object.objectHash)) continue;

    created.set(object.objectHash, { objectHash: object.objectHash, path: object.path });
  }

  return [...created.values()];
}

/** The declaration of the first module of `objects` that creates each object, by hash. */
export function createdDeclarations(
  objects: readonly ModuleObject[],
): ReadonlyMap<string, ObjectDeclaration> {
  const declarations = new Map<string, ObjectDeclaration>();
  for (const object of objects) {
    if (object.action.kind !== "create" || declarations.has(object.objectHash)) continue;

    declarations.set(object.objectHash, object.action.declaration);
  }

  return declarations;
}

/** How many objects that `objects` creates are of the class `classHash`. */
export function createdOfClass(objects: readonly ModuleObject[], classHash: string): number {
  let count = 0;
  for (const declaration of createdDeclarations(objects).values()) {
    if (declaration.classHash === classHash) count += 1;
  }

  return count;
}

/**
 * The created objects of `objects` that a find of `pattern` matches, as the backend's hits.
 *
 * The match reads `pattern` as `find_objects` does: its characters, or a regular expression when
 * `regex` holds, case-insensitive either way. `classTerm` is a class name prefix or a `0x` hash.
 * An empty pattern with no class term matches nothing, and so does a pattern that does not parse.
 */
export function findCreatedObjects(
  objects: readonly ModuleObject[],
  pattern: string,
  regex: boolean,
  classTerm: string | null,
): ObjectFindHit[] {
  if (pattern.length === 0 && classTerm === null) return [];

  const ranges = pathMatcher(pattern, regex);
  if (ranges === null) return [];

  const hits: ObjectFindHit[] = [];
  const seen = new Set<string>();
  for (const object of objects) {
    if (object.action.kind !== "create" || seen.has(object.objectHash)) continue;
    seen.add(object.objectHash);

    const { declaration } = object.action;
    if (classTerm !== null && !matchesClass(declaration, classTerm)) continue;

    const found = ranges(object.path);
    if (found === null) continue;

    hits.push({
      objectHash: object.objectHash,
      path: object.path,
      ranges: found,
      declarations: [declaration],
    });
  }

  return hits;
}

/**
 * `answer`, the install's find of `input`, with the created objects of `objects` that it matches
 * added. Any answer but a ready one is returned as it is.
 */
export function withCreatedHits(
  answer: IndexResponse<SearchHits<ObjectFindHit>> | undefined,
  objects: readonly ModuleObject[],
  input: string,
  regex: boolean,
): IndexResponse<SearchHits<ObjectFindHit>> | undefined {
  if (answer?.status !== "ready" || objects.length === 0) return answer;

  const term = splitClassTerm(input);
  const pattern = term === null ? input.trim() : term.rest;
  const listed = new Set(answer.value.hits.map((hit) => hit.objectHash));
  const added = findCreatedObjects(objects, pattern, regex, term?.value ?? null).filter(
    (hit) => !listed.has(hit.objectHash),
  );
  if (added.length === 0) return answer;

  const { hits, total } = answer.value;
  return {
    status: "ready",
    value: { ...answer.value, hits: [...hits, ...added], total: total + added.length },
  };
}

/** The runs of a path that `pattern` matches, or null for a path it misses. */
type PathMatcher = (path: string) => [number, number][] | null;

/** A matcher of `pattern`, or null when the pattern is a regex that does not parse. */
function pathMatcher(pattern: string, regex: boolean): PathMatcher | null {
  if (pattern.length === 0) return () => [];

  if (!regex) {
    const needle = pattern.toLowerCase();
    return (path) => {
      const at = path.toLowerCase().indexOf(needle);
      return at < 0 ? null : [[at, at + needle.length]];
    };
  }

  let expression: RegExp;
  try {
    expression = new RegExp(pattern, "i");
  } catch {
    return null;
  }

  return (path) => {
    const match = expression.exec(path);
    return match === null ? null : [[match.index, match.index + match[0].length]];
  };
}

/** Whether `declaration` is of a class `term` opens: a `0x` hash, or a name prefix. */
function matchesClass(declaration: ObjectDeclaration, term: string): boolean {
  const value = term.toLowerCase();
  if (value.startsWith("0x")) return declaration.classHash.toLowerCase() === value;

  return declaration.class.toLowerCase().startsWith(value);
}

function moduleMark(object: ModuleObject): ModuleMark {
  return { action: object.action.kind, name: object.moduleName ?? `#${object.module + 1}` };
}

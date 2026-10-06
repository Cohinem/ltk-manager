/**
 * The objects a project declares and the install does not, added to the install's listings.
 *
 * Pure. "A node only the project declares" in docs/ux/PROJECT_EDITOR.md.
 */

import type {
  ContentTree,
  ObjectDirListing,
  ObjectNodeEntry,
  ObjectPrefixEntry,
} from "@/lib/tauri";

import { compareNames } from "../../shared/utils/naturalOrder";
import { isObjectHash, UNNAMED_PREFIX } from "./objectTree";

/** An object only the project declares: its hash, and its path or the hash again. */
export interface ProjectObject {
  readonly objectHash: string;
  readonly path: string;
}

export const NO_PROJECT_OBJECTS: readonly ProjectObject[] = [];

/** Every object the layers of `tree` declare whose hash is not in `installed`, once each. */
export function projectOnlyObjects(
  tree: ContentTree | undefined,
  installed: ReadonlySet<string>,
): ProjectObject[] {
  const own = new Map<string, ProjectObject>();
  for (const layer of tree?.layers ?? []) {
    for (const entry of layer.entries) {
      for (const object of entry.objects) {
        if (installed.has(object.objectHash) || own.has(object.objectHash)) continue;

        const path = isObjectHash(object.path) ? object.objectHash : object.path;
        own.set(object.objectHash, { objectHash: object.objectHash, path });
      }
    }
  }

  return [...own.values()];
}

/** Whether any of `objects` sits under `prefix`, the unnamed under the unnamed group. */
export function holdsProjectObjects(prefix: string, objects: readonly ProjectObject[]): boolean {
  return objects.some((object) => sitsUnder(object, prefix));
}

/**
 * `listing` of `prefix` with the project's own objects added, in the shape the backend answers.
 *
 * An added object is an entry of no declarations, which the layer join fills. A prefix the
 * install does not hold folds through single-child runs as the backend folds its own. A
 * folded install prefix that an added object branches off inside is cut back to the branch,
 * and one an added object sits at becomes that object's row. Counts take the objects added
 * below.
 */
export function withProjectObjects(
  prefix: string,
  listing: ObjectDirListing,
  objects: readonly ProjectObject[],
): ObjectDirListing {
  const under = objects.filter((object) => sitsUnder(object, prefix));
  const unnamed = prefix === "" ? objects.filter((object) => isUnnamed(object)).length : 0;
  if (under.length === 0 && unnamed === 0) return listing;

  if (prefix === UNNAMED_PREFIX) {
    const held = new Set(listing.objects.map((entry) => entry.objectHash));
    const added = under
      .filter((object) => !held.has(object.objectHash))
      .map((object) => objectEntry(object, object.objectHash, 0));

    return { prefixes: listing.prefixes, objects: sorted([...listing.objects, ...added]) };
  }

  const cut = prefix === "" ? 0 : prefix.length + 1;
  const groups = new Map<string, ProjectObject[]>();
  for (const object of under) {
    const segment = firstSegment(object.path.slice(cut));
    const group = groups.get(segment);
    if (group) group.push(object);
    else groups.set(segment, [object]);
  }

  const prefixes = [...listing.prefixes];
  const entries = [...listing.objects];
  for (const [segment, group] of groups) {
    const child = `${prefix === "" ? "" : `${prefix}/`}${segment}`;
    const self = group.find((object) => object.path === child);
    const below = group.filter((object) => object !== self);

    const objectAt = entries.findIndex((entry) => entry.path === child);
    if (objectAt >= 0) {
      const entry = entries[objectAt]!;
      entries[objectAt] = { ...entry, count: entry.count + below.length };
      continue;
    }

    const runAt = prefixes.findIndex((held) => runsThrough(held, child));
    const run = prefixes[runAt];
    const count = (run?.count ?? 0) + below.length;
    if (self !== undefined) {
      if (run !== undefined) prefixes.splice(runAt, 1);
      entries.push(objectEntry(self, segment, count));
      continue;
    }

    const path = foldedPath(child, run?.path ?? null, below);
    const folded: ObjectPrefixEntry = { path, name: path.slice(cut), count };
    if (run === undefined) prefixes.push(folded);
    else prefixes[runAt] = folded;
  }

  if (unnamed > 0) {
    const groupAt = prefixes.findIndex((held) => held.path === UNNAMED_PREFIX);
    const group = prefixes[groupAt];
    if (group === undefined) {
      prefixes.push({ path: UNNAMED_PREFIX, name: UNNAMED_PREFIX, count: unnamed });
    } else {
      prefixes[groupAt] = { ...group, count: group.count + unnamed };
    }
  }

  return { prefixes: prefixes.sort(comparePrefixes), objects: sorted(entries) };
}

/** `root` under `""` and each loaded listing of `listings`, with the project's own objects added. */
export function withProjectListings(
  root: ObjectDirListing,
  listings: ReadonlyMap<string, ObjectDirListing | null>,
  objects: readonly ProjectObject[],
): Map<string, ObjectDirListing | null> {
  const all = new Map<string, ObjectDirListing | null>();
  for (const [path, listing] of listings) {
    all.set(path, listing === null ? null : withProjectObjects(path, listing, objects));
  }
  all.set("", withProjectObjects("", root, objects));

  return all;
}

function isUnnamed(object: ProjectObject): boolean {
  return object.path === object.objectHash;
}

/** Whether `object` is listed somewhere below `prefix`. The unnamed sit under their group alone. */
function sitsUnder(object: ProjectObject, prefix: string): boolean {
  if (isUnnamed(object)) return prefix === UNNAMED_PREFIX;
  if (prefix === UNNAMED_PREFIX) return false;

  return prefix === "" || object.path.startsWith(`${prefix}/`);
}

/** Whether the folded install prefix `held` is `child` or runs on from it. */
function runsThrough(held: ObjectPrefixEntry, child: string): boolean {
  return held.path !== UNNAMED_PREFIX && (held.path === child || held.path.startsWith(`${child}/`));
}

function firstSegment(path: string): string {
  const cut = path.indexOf("/");
  return cut < 0 ? path : path.slice(0, cut);
}

/**
 * The path the prefix row at `child` folds to, with `below` added under it.
 *
 * `runEnd` is where the install's own folded run from `child` ends, and null where the install
 * holds nothing there. The row folds while its node holds one prefix and no object, counting
 * the install's children and the added ones together.
 */
function foldedPath(child: string, runEnd: string | null, below: readonly ProjectObject[]): string {
  let path = child;
  for (;;) {
    if (path === runEnd) return path;

    const cut = path.length + 1;
    if (below.some((object) => !object.path.slice(cut).includes("/"))) return path;

    const next = new Set(below.map((object) => firstSegment(object.path.slice(cut))));
    if (runEnd !== null) next.add(firstSegment(runEnd.slice(cut)));
    if (next.size !== 1) return path;

    path = `${path}/${[...next][0]}`;
  }
}

function objectEntry(object: ProjectObject, name: string, count: number): ObjectNodeEntry {
  return { objectHash: object.objectHash, path: object.path, name, declarations: [], count };
}

function sorted(entries: ObjectNodeEntry[]): ObjectNodeEntry[] {
  return entries.sort((a, b) => compareNames(a.name, b.name));
}

/** Natural name order, the unnamed group last. */
function comparePrefixes(a: ObjectPrefixEntry, b: ObjectPrefixEntry): number {
  const last = Number(a.path === UNNAMED_PREFIX) - Number(b.path === UNNAMED_PREFIX);
  return last !== 0 ? last : compareNames(a.name, b.name);
}

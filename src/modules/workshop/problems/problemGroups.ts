import type { Problem, ProblemSeverity, RuleId, RuleInfo } from "@/lib/tauri";

/**
 * How the panel orders severities, worst first.
 *
 * The order is a map rather than a comparison on the string, so a severity added
 * to the backend is a compile error here instead of a row that sorts last.
 */
const SEVERITY_RANK: Record<ProblemSeverity, number> = {
  fatal: 0,
  error: 1,
  warning: 2,
  info: 3,
};

/* A layer name, a POSIX path and a typed search term can each hold every character
   a separator would normally reach for, so what joins them is the one they cannot
   hold. Two values glued on it never read as a third. */
const NUL = "\u0000";

/** How many problems a list holds at each severity. */
export interface SeverityCounts {
  fatals: number;
  errors: number;
  warnings: number;
  infos: number;
}

/** Every problem the run found in one object of one file. */
export interface ProblemObject {
  /** The group's id and the entry, so no object collides with a file. */
  id: string;
  /** The object's path hash, as the file addresses it. */
  entry: string;
  /** The object's path, or its hash where no table names it. */
  name: string;
  problems: readonly Problem[];
}

/** Every problem the run found in one file of one layer. */
export interface ProblemGroup extends SeverityCounts {
  /** Stable across runs, so a collapsed group stays collapsed through a re-run. */
  id: string;
  layer: string;
  /** POSIX, relative to the layer root. */
  path: string;
  /** The last segment of `path`, which is what a row draws big. */
  fileName: string;
  /** The directory part of `path`, empty at the layer root. */
  directory: string;
  /** Every problem of the file, which is what a Fix on the group applies to. */
  problems: readonly Problem[];
  objects: ProblemObject[];
  /** What a rule reported against the file rather than against an object. */
  loose: readonly Problem[];
}

/** One rendered row: a file's header, an object's header, or one finding. */
export type ProblemRow =
  | { kind: "group"; id: string; group: ProblemGroup }
  | { kind: "object"; id: string; group: ProblemGroup; object: ProblemObject }
  | { kind: "problem"; id: string; group: ProblemGroup; problem: Problem };

/** An object under construction, carrying the sort key the finished shape drops. */
interface ObjectBuild {
  readonly id: string;
  readonly entry: string;
  readonly problems: Problem[];
  worst: number;
}

/** A group under construction, carrying the sort key the finished shape drops. */
interface GroupBuild {
  readonly id: string;
  readonly layer: string;
  readonly path: string;
  readonly fileName: string;
  readonly directory: string;
  readonly problems: Problem[];
  readonly objects: Map<string, ObjectBuild>;
  readonly loose: Problem[];
  worst: number;
}

/**
 * Collect a run's problems into one group per file, and one per object inside it.
 *
 * Groups come back worst-severity first, then by layer, then by path, and a
 * group's objects the same way. The backend hands its problems back in severity
 * order already, but grouping breaks it: a file holding one error and fifty
 * warnings has to sort on the error, which is not where the file's first problem
 * sits. Within an object the backend's order survives untouched.
 *
 * `names` is the run's object catalogue. An object it does not hold reads as its
 * hash, which is what the file itself carries.
 */
export function groupProblems(
  problems: readonly Problem[],
  names: ReadonlyMap<string, string>,
): ProblemGroup[] {
  const builds = new Map<string, GroupBuild>();

  for (const problem of problems) {
    const { layer, path, node } = problem.site;
    const id = `${layer}${NUL}${path}`;
    const rank = SEVERITY_RANK[problem.severity];

    let build = builds.get(id);
    if (!build) {
      const cut = path.lastIndexOf("/");
      build = {
        id,
        layer,
        path,
        fileName: fileNameOf(path),
        directory: cut === -1 ? "" : path.slice(0, cut),
        problems: [],
        objects: new Map(),
        loose: [],
        worst: rank,
      };
      builds.set(id, build);
    }

    build.problems.push(problem);
    if (rank < build.worst) build.worst = rank;

    if (!node) {
      build.loose.push(problem);
      continue;
    }

    const object = build.objects.get(node.entry);
    if (object) {
      object.problems.push(problem);
      if (rank < object.worst) object.worst = rank;
      continue;
    }
    build.objects.set(node.entry, {
      id: `${id}${NUL}${node.entry}`,
      entry: node.entry,
      problems: [problem],
      worst: rank,
    });
  }

  return [...builds.values()].sort(compareBuilds).map((build) => ({
    id: build.id,
    layer: build.layer,
    path: build.path,
    fileName: build.fileName,
    directory: build.directory,
    problems: build.problems,
    objects: finishObjects(build, names),
    loose: build.loose,
    ...countBySeverity(build.problems),
  }));
}

/** One group's objects, worst first, named where the catalogue names them. */
function finishObjects(build: GroupBuild, names: ReadonlyMap<string, string>): ProblemObject[] {
  const named = [...build.objects.values()].map((object) => ({
    object,
    name: names.get(object.entry) ?? object.entry,
  }));
  named.sort((a, b) => a.object.worst - b.object.worst || a.name.localeCompare(b.name));

  return named.map(({ object, name }) => ({
    id: object.id,
    entry: object.entry,
    name,
    problems: object.problems,
  }));
}

function compareBuilds(a: GroupBuild, b: GroupBuild): number {
  return a.worst - b.worst || a.layer.localeCompare(b.layer) || a.path.localeCompare(b.path);
}

function fileNameOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? path : path.slice(cut + 1);
}

/**
 * Split a layer path into the archive it mounts into and the path inside it.
 *
 * Nearly every file of a project sits in the same one or two archives, so the
 * name is the least distinguishing part of the path and the first thing a row
 * can give up for width.
 */
export function splitWadPath(path: string): { wad: string | null; inner: string } {
  const cut = path.indexOf("/");
  if (cut === -1) return { wad: null, inner: path };

  const head = path.slice(0, cut);
  if (!head.includes(".wad")) return { wad: null, inner: path };
  return { wad: head, inner: path.slice(cut + 1) };
}

/** The run's object catalogue as a lookup, keyed by the hash a site names. */
export function objectNames(objects: readonly { entry: string; name: string }[]) {
  return new Map(objects.map((object) => [object.entry, object.name]));
}

/**
 * What a row draws for a problem, and what the search box matches.
 *
 * A rule that reads a file as a whole names no node, so the file stands in for
 * one. A node with an empty path is the object itself, which only its entry hash
 * can name.
 */
export function problemAddress(problem: Problem): string {
  const { path, node } = problem.site;
  if (!node) return fileNameOf(path);
  /* The label is the same path with the hashes a table could name replaced, so
     it is the readable one wherever it exists. */
  return node.label || node.path || node.entry;
}

/**
 * Keep the problems that match every term of a search query.
 *
 * Terms split on whitespace and match case-insensitively, and each one may land
 * on any of the note, either type, the address, the object, the rule id, the
 * layer or the file path.
 */
export function filterProblems(
  problems: readonly Problem[],
  query: string,
  names: ReadonlyMap<string, string>,
): Problem[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

  /* The same array rather than a copy, because this runs on every keystroke over
     thousands of problems and an empty box must not invalidate what memoizes on it. */
  if (terms.length === 0) return problems as Problem[];

  return problems.filter((problem) => {
    const entry = problem.site.node?.entry;
    const haystack = [
      problem.message ?? "",
      problem.mismatch?.expected ?? "",
      problem.mismatch?.found ?? "",
      problemAddress(problem),
      problem.site.node?.path ?? "",
      entry ?? "",
      (entry && names.get(entry)) ?? "",
      problem.rule,
      problem.site.layer,
      problem.site.path,
    ]
      .join(NUL)
      .toLowerCase();

    return terms.every((term) => haystack.includes(term));
  });
}

/**
 * Walk grouped problems into the flat row list the virtualizer renders.
 *
 * `expanded` names what is open, which is the opposite of `flattenTree`'s
 * collapsed set in `../utils/contentTree.ts` and deliberately so. A tree of files
 * opens by default and names the few directories a user shut, where a run can
 * hold thousands of problems and so opens nothing until a user asks for a file.
 */
export function flattenGroups(
  groups: readonly ProblemGroup[],
  expanded: ReadonlySet<string>,
): ProblemRow[] {
  const rows: ProblemRow[] = [];

  for (const group of groups) {
    rows.push({ kind: "group", id: group.id, group });
    if (!expanded.has(group.id)) continue;

    /* A problem the rule reported against the file sits under no object, so it
       reads before the objects rather than under one of them. */
    for (const problem of group.loose) {
      rows.push({ kind: "problem", id: problem.id, group, problem });
    }

    for (const object of group.objects) {
      rows.push({ kind: "object", id: object.id, group, object });
      if (!expanded.has(object.id)) continue;
      for (const problem of object.problems) {
        rows.push({ kind: "problem", id: problem.id, group, problem });
      }
    }
  }

  return rows;
}

/**
 * The rules that are looking ahead: waiting on a build this game has not taken.
 *
 * A check about a change Riot has not deployed has found nothing wrong with
 * the mod today, and repairing what it found would break the mod on the client
 * the user has. So its findings draw muted where the forward-looking linter is
 * on, and do not draw at all where it is off.
 */
export function mutedRules(rules: readonly RuleInfo[]): ReadonlySet<RuleId> {
  const muted = new Set<RuleId>();
  for (const info of rules) {
    if (info.state.kind === "dormant") muted.add(info.id);
  }
  return muted;
}

/**
 * Whether one finding is about a build the installed game has not taken.
 *
 * A rule can hold tables for several builds, and the findings from the ones
 * the game has taken raise `fatal`. Those are a crash today whatever the rule
 * is still waiting on, so they are never muted and never hidden.
 */
export function isMuted(problem: Problem, muted: ReadonlySet<RuleId>): boolean {
  return problem.severity !== "fatal" && muted.has(problem.rule);
}

/**
 * The findings the panel draws, once the forward-looking setting is settled.
 *
 * Off is the default and it hides them outright, so every tally in the panel
 * counts the same list a reader is looking at. The count beside Test is the
 * one that leaves them out either way - read `ProblemsBadge`.
 */
export function shownProblems(
  problems: readonly Problem[],
  muted: ReadonlySet<RuleId>,
  forwardLooking: boolean,
): readonly Problem[] {
  if (forwardLooking) return problems;
  return problems.filter((problem) => !isMuted(problem, muted));
}

/** Tally a list of problems by severity, for the counts a header draws. */
export function countBySeverity(problems: readonly Problem[]): SeverityCounts {
  const counts: Record<ProblemSeverity, number> = { fatal: 0, error: 0, warning: 0, info: 0 };
  for (const problem of problems) counts[problem.severity] += 1;
  return {
    fatals: counts.fatal,
    errors: counts.error,
    warnings: counts.warning,
    infos: counts.info,
  };
}

import { useMemo } from "react";

import type { Problem, RuleId, RuleInfo } from "@/lib/tauri";
import { useForwardLookingMeta } from "@/stores";

import { useProjectProblems } from "../api";
import { useProjectContext } from "../components/ProjectContext";
import { isMuted, mutedRules, objectNames, shownProblems } from "./problemGroups";

/**
 * What the run says one of its checks is.
 *
 * The catalogue rides on the run rather than on every problem, because the words
 * describing a check are the same on all seven thousand rows of it. `undefined`
 * for a run written before the catalogue existed, so a caller falls back to the
 * id every problem carries.
 */
export function useRuleInfo(rule: RuleId): RuleInfo | undefined {
  const project = useProjectContext();
  const { data: run } = useProjectProblems(project.path);

  return run?.rules.find((info) => info.id === rule);
}

/**
 * The rules looking ahead of the installed game, whose findings draw muted.
 *
 * A check about a change Riot has not deployed still runs, because the day it
 * lands is the day every mod that shipped the old type stops working. What it
 * does not do is claim the mod is broken today, so the forward-looking setting
 * decides whether the panel draws its findings at all, and the count beside
 * Test never includes them.
 */
export function useMutedRules(): ReadonlySet<RuleId> {
  const project = useProjectContext();
  const { data: run } = useProjectProblems(project.path);

  return useMemo(() => mutedRules(run?.rules ?? []), [run]);
}

/** Whether one finding draws muted, for the row that draws it. */
export function useMutedProblem(problem: Problem): boolean {
  return isMuted(problem, useMutedRules());
}

/**
 * The findings this panel draws, and the one list every tally in it counts.
 *
 * Memoized on the run, so the filter runs once for the several components that
 * each read it rather than once per component.
 */
export function useShownProblems(): readonly Problem[] {
  const project = useProjectContext();
  const { data: run } = useProjectProblems(project.path);
  const muted = useMutedRules();
  const forwardLooking = useForwardLookingMeta();

  return useMemo(
    () => shownProblems(run?.problems ?? [], muted, forwardLooking),
    [run, muted, forwardLooking],
  );
}

/**
 * Every check waiting on a build this game has not taken.
 *
 * Read at either setting, because the control that turns them on has to say
 * what it would turn on. Empty on a machine whose game has taken every change
 * the manager ships a table for.
 */
export function useDormantRules(): readonly RuleInfo[] {
  const project = useProjectContext();
  const { data: run } = useProjectProblems(project.path);

  return useMemo(() => (run?.rules ?? []).filter((info) => info.state.kind === "dormant"), [run]);
}

/**
 * How many findings the forward-looking setting is the difference between.
 *
 * The whole run rather than what the panel drew, because this is the number
 * the toggle promises and the toggle is what decides whether they are drawn.
 */
export function useAheadCount(): number {
  const project = useProjectContext();
  const { data: run } = useProjectProblems(project.path);
  const muted = useMutedRules();

  return useMemo(
    () => (run?.problems ?? []).filter((problem) => isMuted(problem, muted)).length,
    [run, muted],
  );
}

/**
 * The run's object catalogue, keyed by the hash a site addresses an object by.
 *
 * Empty until the run answers, and holding only the objects a hash table could
 * name. A miss is a hash the panel draws as the hex the file itself carries.
 */
export function useObjectNames(): ReadonlyMap<string, string> {
  const project = useProjectContext();
  const { data: run } = useProjectProblems(project.path);

  return useMemo(() => objectNames(run?.objects ?? []), [run]);
}

/** One object's path, for a row that draws it away from the list's grouping. */
export function useObjectName(entry: string | undefined): string | undefined {
  const names = useObjectNames();
  return entry === undefined ? undefined : names.get(entry);
}

// @vitest-environment happy-dom

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { installedMod, verdict } from "../../../components/__tests__/modHealthFixtures";

const useInstalledMods = vi.fn();
const useModHealthVerdicts = vi.fn();

vi.mock("../../queries", () => ({ useInstalledMods: () => useInstalledMods() }));
vi.mock("../useModHealthVerdicts", () => ({
  useModHealthVerdicts: () => useModHealthVerdicts(),
}));

import { type HealthFilter, useHealthVerdicts } from "../useHealthVerdicts";

type Verdicts = Record<string, ReturnType<typeof verdict>>;

/** The library as the two queries hold it, and what one filter picks out of it. */
function library(
  mods: ReturnType<typeof installedMod>[],
  verdicts: Verdicts,
  filter: HealthFilter,
) {
  useInstalledMods.mockReturnValue({ data: mods });
  useModHealthVerdicts.mockReturnValue({ data: verdicts });
  return renderHook(() => useHealthVerdicts(filter)).result.current.map((held) => held.modId);
}

function installed(...ids: string[]) {
  return ids.map((id) => installedMod(id, id));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useHealthVerdicts", () => {
  it("splits the unhealthy verdicts by whether a repair reaches them", () => {
    const mods = installed("a", "b");
    const verdicts = { a: verdict("a", "repairable"), b: verdict("b", "unrepairable") };

    expect(library(mods, verdicts, { health: "broken" })).toEqual(["a", "b"]);
    expect(library(mods, verdicts, { health: "repairable" })).toEqual(["a"]);
    expect(library(mods, verdicts, { health: "unrepairable" })).toEqual(["b"]);
  });

  /* A healthy verdict carries no counts and no rules, so a surface that drew one
     would draw a row with no tally and nothing to unfold. `broken` is the list
     the sweep panel renders, so letting one through is a blank row. */
  it("keeps a healthy verdict out of every broken list", () => {
    const mods = installed("a", "b");
    const verdicts = { a: verdict("a", "repairable"), b: verdict("b", "healthy") };

    expect(library(mods, verdicts, { health: "broken" })).toEqual(["a"]);
    expect(library(mods, verdicts, { health: "unrepairable" })).toEqual([]);
  });

  it("keeps only a healthy verdict that still found something informative", () => {
    const mods = installed("a", "b", "c");
    const verdicts = {
      a: verdict("a", "healthy", { severity: "info" }),
      b: verdict("b", "healthy"),
      c: verdict("c", "repairable"),
    };

    expect(library(mods, verdicts, { health: "informational" })).toEqual(["a"]);
  });

  it("keeps only the mods a patch would carry", () => {
    const mods = [installedMod("a", "a"), installedMod("b", "b", false)];
    const verdicts = { a: verdict("a", "repairable"), b: verdict("b", "repairable") };

    expect(library(mods, verdicts, { health: "broken", enabled: true })).toEqual(["a"]);
    expect(library(mods, verdicts, { health: "broken", enabled: false })).toEqual(["b"]);
    expect(library(mods, verdicts, { health: "broken" })).toEqual(["a", "b"]);
  });

  /* A verdict outlives the mod it describes until the next sweep prunes it, so
     the walk is over the installed mods rather than over the verdicts. */
  it("says nothing about a verdict whose mod is gone", () => {
    const verdicts = { a: verdict("a", "repairable"), gone: verdict("gone", "unrepairable") };

    expect(library(installed("a"), verdicts, { health: "broken" })).toEqual(["a"]);
  });

  it("is empty before either query has answered", () => {
    useInstalledMods.mockReturnValue({ data: undefined });
    useModHealthVerdicts.mockReturnValue({ data: undefined });

    const { result } = renderHook(() => useHealthVerdicts({ health: "broken" }));

    expect(result.current).toEqual([]);
  });
});

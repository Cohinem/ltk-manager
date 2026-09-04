// @vitest-environment happy-dom

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { installedMod, verdict } from "../../components/__tests__/modHealthFixtures";

const useInstalledMods = vi.fn();
const useModHealthVerdicts = vi.fn();

vi.mock("../queries", () => ({ useInstalledMods: () => useInstalledMods() }));
vi.mock("../useModHealthVerdicts", () => ({
  useModHealthVerdicts: () => useModHealthVerdicts(),
}));

import { useBrokenMods } from "../useBrokenMods";

function library(mods: string[], verdicts: Record<string, ReturnType<typeof verdict>>) {
  useInstalledMods.mockReturnValue({ data: mods.map((id) => installedMod(id, id)) });
  useModHealthVerdicts.mockReturnValue({ data: verdicts });
  return renderHook(() => useBrokenMods()).result.current;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useBrokenMods", () => {
  it("splits the unhealthy verdicts by whether a repair reaches them", () => {
    const broken = library(["a", "b"], {
      a: verdict("a", "repairable"),
      b: verdict("b", "unrepairable"),
    });

    expect(broken.repairable.map((v) => v.modId)).toEqual(["a"]);
    expect(broken.unrepairable.map((v) => v.modId)).toEqual(["b"]);
    expect(broken.all.map((v) => v.modId)).toEqual(["a", "b"]);
  });

  /* A healthy verdict carries no counts and no rules, so a surface that drew one
     would draw a row with no tally and nothing to unfold. `all` is the list the
     sweep panel renders, so letting one through is a blank row. */
  it("keeps a healthy verdict out of every list, including all", () => {
    const broken = library(["a", "b"], {
      a: verdict("a", "repairable"),
      b: verdict("b", "healthy"),
    });

    expect(broken.all.map((v) => v.modId)).toEqual(["a"]);
    expect(broken.repairable.map((v) => v.modId)).toEqual(["a"]);
    expect(broken.unrepairable).toEqual([]);
  });

  /* A verdict outlives the mod it describes until the next sweep prunes it, so
     the walk is over the installed mods rather than over the verdicts. */
  it("says nothing about a verdict whose mod is gone", () => {
    const broken = library(["a"], {
      a: verdict("a", "repairable"),
      gone: verdict("gone", "unrepairable"),
    });

    expect(broken.all.map((v) => v.modId)).toEqual(["a"]);
  });

  it("is empty before either query has answered", () => {
    useInstalledMods.mockReturnValue({ data: undefined });
    useModHealthVerdicts.mockReturnValue({ data: undefined });

    const broken = renderHook(() => useBrokenMods()).result.current;

    expect(broken).toEqual({ all: [], repairable: [], unrepairable: [] });
  });
});

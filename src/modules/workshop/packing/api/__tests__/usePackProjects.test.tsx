// @vitest-environment happy-dom

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PackResult, WorkshopProject } from "@/lib/tauri";

import { usePackRunsStore, usePackTargetStore } from "../../../state";
import { packProject, usePackProjects } from "../usePackProjects";

const { validate, pack, toast } = vi.hoisted(() => ({
  validate: vi.fn(),
  pack: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/tauri", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tauri")>();
  return {
    ...actual,
    api: { ...actual.api, validateProject: validate, packWorkshopProject: pack },
    revealPath: vi.fn(),
  };
});
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  useToast: () => ({ toast }),
}));

function project(name: string): WorkshopProject {
  return {
    path: `X:/mods/${name}`,
    name,
    displayName: name,
    version: "1.0.0",
    description: "",
    authors: [],
    tags: [],
    champions: [],
    maps: [],
    layers: [],
    thumbnailPath: null,
    lastModified: "2026-10-01T10:00:00Z",
    location: "workshop",
    lastOpened: null,
    id: "project-id",
  };
}

function packed(format: string): { ok: true; value: PackResult } {
  return {
    ok: true,
    value: { outputPath: `X:/build/one.${format}`, fileName: `one.${format}`, format, ignored: [] },
  };
}

const valid = (warnings: string[] = []) => ({
  ok: true,
  value: { valid: true, errors: [], warnings },
});

beforeEach(() => {
  vi.clearAllMocks();
  usePackRunsStore.setState({ packing: new Set() });
  usePackTargetStore.setState({ target: "both" });
  pack.mockImplementation(async ({ format }: { format: string }) => packed(format));
});

describe("packProject", () => {
  it("writes each format in turn", async () => {
    validate.mockResolvedValue(valid());

    const outcome = await packProject(project("one"), ["modpkg", "fantome"]);

    expect(pack.mock.calls.map(([args]) => args.format)).toEqual(["modpkg", "fantome"]);
    expect(outcome).toMatchObject({ kind: "packed", warnings: [] });
  });

  it("writes nothing while the pre-flight check has errors", async () => {
    validate.mockResolvedValue({
      ok: true,
      value: { valid: false, errors: ["content/ directory not found"], warnings: [] },
    });

    const outcome = await packProject(project("one"), ["modpkg"]);

    expect(pack).not.toHaveBeenCalled();
    expect(outcome).toEqual({ kind: "refused", errors: ["content/ directory not found"] });
  });

  it("stops at the first format that fails", async () => {
    validate.mockResolvedValue(valid());
    pack.mockResolvedValueOnce({ ok: false, error: { code: "PACK_FAILED", detail: "disk full" } });

    const outcome = await packProject(project("one"), ["modpkg", "fantome"]);

    expect(pack).toHaveBeenCalledTimes(1);
    expect(outcome.kind).toBe("failed");
  });
});

describe("usePackProjects", () => {
  it("packs to the remembered target", async () => {
    usePackTargetStore.setState({ target: "fantome" });
    validate.mockResolvedValue(valid());
    const run = renderHook(() => usePackProjects()).result.current;

    await run([project("one")]);

    expect(pack).toHaveBeenCalledWith({ projectPath: "X:/mods/one", format: "fantome" });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Packed one" }));
  });

  it("skips a project already packing", async () => {
    usePackRunsStore.setState({ packing: new Set(["X:/mods/one"]) });
    const run = renderHook(() => usePackProjects()).result.current;

    await run([project("one")]);

    expect(validate).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it("releases each project as its pack ends", async () => {
    validate.mockResolvedValue(valid());
    const run = renderHook(() => usePackProjects()).result.current;

    await run([project("one"), project("two")]);

    expect(usePackRunsStore.getState().packing.size).toBe(0);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Packed 2 of 2 projects", type: "success" }),
    );
  });
});

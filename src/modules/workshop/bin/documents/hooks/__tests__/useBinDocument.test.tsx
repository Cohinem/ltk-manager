// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";

import type { AssetRef, ReadOnly, SandboxRef } from "@/lib/tauri";
import { mockInvoke } from "@/test/mocks/tauri";
import { createTestQueryClient } from "@/test/utils";

import { ProjectProvider } from "../../../../projects/state/ProjectContext";
import {
  DocumentSandboxProvider,
  RouteSandboxProvider,
} from "../../../../sandbox/state/SandboxContext";
import { EMPTY_EDITOR, useWorkshopEditorStore } from "../../../../state";
import { PROJECT } from "../../../tree/components/__tests__/binEditFixtures";
import { type BinOpenState, useBinDocument } from "../useBinDocument";

const ASSET: AssetRef = { kind: "gameChunk", wad: "Ahri.wad.client", pathHash: "00aa" };

const DECLARED = { layer: "base", layers: ["base"], marks: [], diagnostics: [] };

let opened: BinOpenState | null = null;

function Open() {
  opened = useBinDocument(ASSET, "0x12345678").state;
  return null;
}

function Lingering() {
  opened = useBinDocument(ASSET, "0x12345678", "lingering").state;
  return null;
}

/** The workshop route with the project at `path` open, as the shell provides it. */
function InProject({ path = PROJECT.path, children }: { path?: string; children: ReactNode }) {
  return (
    <ProjectProvider project={{ ...PROJECT, path }}>
      <RouteSandboxProvider project={path}>{children}</RouteSandboxProvider>
    </ProjectProvider>
  );
}

function Queries({ children }: { children: ReactNode }) {
  const [client] = useState(() => createTestQueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function gate(): ReadOnly | null {
  return opened?.status === "open" ? opened.handle.readOnly : null;
}

let layerFiles: string[] = [];

beforeEach(() => {
  opened = null;
  layerFiles = [];
  useWorkshopEditorStore.setState({ byProject: { [PROJECT.path]: EMPTY_EDITOR } });
  mockInvoke.mockReset();
  let document = 0;
  mockInvoke.mockImplementation((command, args?: Record<string, unknown>) => {
    if (command === "bin_open") {
      const sandbox = args?.sandbox as SandboxRef;
      const inProject = sandbox.kind === "project";
      return Promise.resolve({
        ok: true,
        value: {
          document: ++document,
          sandbox,
          asset: args?.asset,
          declared: inProject ? DECLARED : null,
          readOnly: inProject ? "declarationsOff" : "gameSandbox",
        },
      });
    }
    if (command === "bin_set_declaring") {
      return Promise.resolve({
        ok: true,
        value: args?.declaring === "on" ? null : "declarationsOff",
      });
    }
    if (command === "get_project_content_tree") {
      const entries = layerFiles.map((relativePath) => ({ relativePath }));
      return Promise.resolve({ ok: true, value: { layers: [{ name: "base", entries }] } });
    }

    return Promise.resolve({ ok: true, value: null });
  });
});

it("opens game data in the current mod project's sandbox and reopens when that project changes", async () => {
  const view = (path: string) => (
    <InProject path={path}>
      <Open />
    </InProject>
  );
  const { rerender } = render(view("C:/mods/first"), { wrapper: Queries });

  await waitFor(() =>
    expect(mockInvoke).toHaveBeenCalledWith("bin_open", {
      sandbox: { kind: "project", project: "C:/mods/first" },
      asset: ASSET,
      entry: "0x12345678",
    }),
  );

  rerender(view("C:/mods/second"));

  await waitFor(() =>
    expect(mockInvoke).toHaveBeenCalledWith("bin_open", {
      sandbox: { kind: "project", project: "C:/mods/second" },
      asset: ASSET,
      entry: "0x12345678",
    }),
  );
  expect(mockInvoke).toHaveBeenCalledWith("bin_close", { document: 1 });
});

/* Acceptance test 3 of docs/plans/sandbox.md: one chunk, two sandboxes, two documents. */
it("opens one chunk once in the project's sandbox and once in the game's", async () => {
  const seen: BinOpenState[] = [];
  function Both() {
    const inProject = useBinDocument(ASSET, "0x12345678").state;
    seen[0] = inProject;
    return (
      <DocumentSandboxProvider sandbox={{ kind: "game" }}>
        <InGame />
      </DocumentSandboxProvider>
    );
  }
  function InGame() {
    seen[1] = useBinDocument(ASSET, "0x12345678").state;
    return null;
  }

  render(
    <InProject>
      <Both />
    </InProject>,
    { wrapper: Queries },
  );

  await waitFor(() => expect(seen.map((state) => state.status)).toEqual(["open", "open"]));
  const [project, game] = seen.map((state) => (state.status === "open" ? state.handle : null));
  expect(project?.document).not.toBe(game?.document);
  expect(project?.sandbox).toEqual({ kind: "project", project: PROJECT.path });
  expect(project?.readOnly).toBe("declarationsOff");
  expect(game?.sandbox).toEqual({ kind: "game" });
  expect(game?.readOnly).toBe("gameSandbox");
});

it("closes a lingering document ten seconds after its caller unmounts", async () => {
  const { unmount } = render(<Lingering />, { wrapper: Queries });
  await waitFor(() => expect(opened?.status).toBe("open"));

  vi.useFakeTimers();
  try {
    unmount();
    expect(mockInvoke).not.toHaveBeenCalledWith("bin_close", { document: 1 });

    vi.advanceTimersByTime(10_000);
    expect(mockInvoke).toHaveBeenCalledWith("bin_close", { document: 1 });
  } finally {
    vi.useRealTimers();
  }
});

it("closes a document at once when its caller unmounts", async () => {
  const { unmount } = render(<Open />, { wrapper: Queries });
  await waitFor(() => expect(opened?.status).toBe("open"));

  unmount();
  expect(mockInvoke).toHaveBeenCalledWith("bin_close", { document: 1 });
});

it("opens a game chunk outside a project in the game sandbox, read-only", async () => {
  render(<Open />, { wrapper: Queries });

  await waitFor(() =>
    expect(mockInvoke).toHaveBeenCalledWith("bin_open", {
      sandbox: { kind: "game" },
      asset: ASSET,
      entry: "0x12345678",
    }),
  );
  await waitFor(() => expect(gate()).toBe("gameSandbox"));
});

it("opens a project's game bin read-only while it declares nothing, and takes edits once turned on", async () => {
  render(
    <InProject>
      <Open />
    </InProject>,
    { wrapper: Queries },
  );

  await waitFor(() => expect(opened?.status).toBe("open"));
  expect(gate()).toBe("declarationsOff");

  act(() => useWorkshopEditorStore.getState().setUseDeclarations(PROJECT.path, true));

  await waitFor(() => expect(gate()).toBeNull());
  expect(mockInvoke).toHaveBeenCalledWith("bin_set_declaring", { document: 1, declaring: "on" });
});

it("opens a project's game bin declaring when a layer already holds declarations", async () => {
  layerFiles = ["game_data.yaml"];
  render(
    <InProject>
      <Open />
    </InProject>,
    { wrapper: Queries },
  );

  await waitFor(() => {
    expect(opened?.status).toBe("open");
    expect(gate()).toBeNull();
  });
});

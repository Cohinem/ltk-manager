// @vitest-environment happy-dom

import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import type { AssetRef, SandboxRef, WorkshopProject } from "@/lib/tauri";
import {
  detailsDocument,
  filesDocument,
  gameDocument,
  objectDocument,
  previewDocument,
} from "@/modules/workshop";

import { ProjectProvider } from "../../../projects/state/ProjectContext";
import {
  DocumentSandboxProvider,
  RouteSandboxProvider,
} from "../../../sandbox/state/SandboxContext";
import { useWorkshopEditorStore } from "../../state/workshopEditor";
import { useOpenDocument, useRecentDocumentIds } from "../useProjectEditor";

const MINE: WorkshopProject = {
  path: "X:/mods/mine",
  name: "mine",
  displayName: "Mine",
  version: "1.0.0",
  description: "",
  authors: [],
  tags: [],
  champions: [],
  maps: [],
  layers: [],
  thumbnailPath: null,
  lastModified: "2026-08-21T21:14:02Z",
  location: "workshop",
  lastOpened: null,
  id: "id-mine",
};

const OTHER = "X:/mods/other";

function wrapper({ children }: { children: ReactNode }) {
  return <ProjectProvider project={MINE}>{children}</ProjectProvider>;
}

function store() {
  return useWorkshopEditorStore.getState();
}

function recent(): readonly string[] {
  return renderHook(() => useRecentDocumentIds(), { wrapper }).result.current;
}

describe("useRecentDocumentIds", () => {
  beforeEach(() => {
    useWorkshopEditorStore.setState({ byProject: {}, history: [], historyIndex: -1 });
  });

  /* The stack spans the shell, and the palette ranks one project's rows, so an
     unfiltered read would hand another project's ids the history bonus. */
  it("reads this project's stops out of a stack that spans the shell", () => {
    store().recordListVisit();
    store().openDocument(MINE.path, detailsDocument());
    store().openDocument(OTHER, gameDocument());
    store().openDocument(MINE.path, filesDocument("base"));

    expect(recent()).toEqual(["files:base", "details"]);
  });

  it("leads with where the user stands, then behind them, then ahead", () => {
    store().openDocument(MINE.path, detailsDocument());
    store().openDocument(MINE.path, filesDocument("base"));
    store().openDocument(MINE.path, gameDocument());
    store().navigateHistory(-1);

    expect(recent()).toEqual(["files:base", "details", "game"]);
  });

  it("has nothing to offer a project nobody has opened", () => {
    store().openDocument(OTHER, gameDocument());

    expect(recent()).toEqual([]);
  });
});

/* Acceptance test 2 of docs/plans/sandbox.md: a link keeps the sandbox of the document it
   is in, so a link out of a declared document opens declared and one out of a game
   document opens in the game. */
describe("useOpenDocument in a sandbox", () => {
  const CHUNK: AssetRef = { kind: "gameChunk", wad: "Champions/Ahri.wad.client", pathHash: "00aa" };
  const LAYER: AssetRef = { kind: "layer", project: MINE.path, layer: "base", path: "a.bin" };

  beforeEach(() => {
    useWorkshopEditorStore.setState({ byProject: {}, history: [], historyIndex: -1 });
  });

  function openFrom(sandbox: SandboxRef | undefined) {
    return renderHook(() => useOpenDocument(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <ProjectProvider project={MINE}>
          <RouteSandboxProvider project={MINE.path}>
            <DocumentSandboxProvider sandbox={sandbox}>{children}</DocumentSandboxProvider>
          </RouteSandboxProvider>
        </ProjectProvider>
      ),
    }).result.current;
  }

  function opened() {
    return Object.values(store().byProject[MINE.path]?.documents ?? {});
  }

  it("opens a link out of a project document in the project's sandbox", () => {
    openFrom(undefined)(objectDocument(CHUNK, "0x12345678", "Ahri", "ahri.bin"));

    expect(opened()).toEqual([
      expect.objectContaining({ id: "object:game:Champions/Ahri.wad.client:00aa:0x12345678" }),
    ]);
    expect(opened()[0]).not.toHaveProperty("sandbox");
  });

  it("opens a link out of a game document in the game sandbox", () => {
    openFrom({ kind: "game" })(previewDocument(CHUNK));

    expect(opened()).toEqual([
      expect.objectContaining({
        id: "preview@game:game:Champions/Ahri.wad.client:00aa",
        sandbox: { kind: "game" },
      }),
    ]);
  });

  it("opens a layer file in its project whichever sandbox the link is in", () => {
    openFrom({ kind: "game" })(previewDocument(LAYER));

    expect(opened()).toEqual([expect.objectContaining({ id: "preview:layer:base:a.bin" })]);
    expect(opened()[0]).not.toHaveProperty("sandbox");
  });
});

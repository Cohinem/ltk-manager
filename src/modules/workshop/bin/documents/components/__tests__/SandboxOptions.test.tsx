// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode, useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { ToastProvider } from "@/components";
import type {
  AssetRef,
  BinDocumentHandle,
  DeclaredModuleChoice,
  DeclaredState,
  GameFileEntry,
  WorkshopProject,
} from "@/lib/tauri";
import { commandNames } from "@/test/commandNames";
import { mockInvoke } from "@/test/mocks/tauri";
import { createTestQueryClient } from "@/test/utils";

import { type ContentDocument, objectDocument } from "../../../../documents/utils/contentDocument";
import { ProjectProvider } from "../../../../projects/state/ProjectContext";
import {
  DocumentSandboxProvider,
  RouteSandboxProvider,
} from "../../../../sandbox/state/SandboxContext";
import { EMPTY_EDITOR, useWorkshopEditorStore } from "../../../../state";
import { SandboxOptions } from "../SandboxOptions";

const DOCUMENT = 7;
const ENTRY = "0x2a1f3c7d";

const PROJECT = {
  path: "C:/mods/jade-teemo",
  name: "jade-teemo",
  displayName: "Jade Teemo",
  version: "1.0.0",
  description: "",
  authors: [],
  tags: [],
  champions: [],
  maps: [],
  layers: [
    { name: "base", displayName: "Base", priority: 0, description: null, stringOverrides: {} },
    { name: "chroma", displayName: "Chroma", priority: 1, description: null, stringOverrides: {} },
  ],
  thumbnailPath: null,
  lastModified: "2026-09-21T10:00:00Z",
  location: "workshop",
  lastOpened: null,
  id: "id-jade-teemo",
} as WorkshopProject;

const IN_PROJECT = { kind: "project", project: PROJECT.path } as const;

const CHUNK: AssetRef = { kind: "gameChunk", wad: "Champions/Teemo.wad.client", pathHash: "ab" };
const SKIN_PATH = "data/characters/teemo/skins/skin0.bin";
const LAYER_FILE: AssetRef = {
  kind: "layer",
  project: PROJECT.path,
  layer: "chroma",
  path: `Teemo.wad.client/${SKIN_PATH}`,
};

const DECLARED: DeclaredState = {
  layer: "base",
  module: { kind: "auto" },
  modules: [
    { index: 0, name: null, takesKeys: true },
    { index: 1, name: "Glow", takesKeys: true },
    { index: 2, name: null, takesKeys: false },
  ],
  layers: ["base", "chroma"],
  marks: [],
  objects: [],
  links: [],
  diagnostics: [],
};

function openBin(overrides: Partial<BinDocumentHandle> = {}): BinDocumentHandle {
  return {
    document: DOCUMENT,
    sandbox: IN_PROJECT,
    asset: CHUNK,
    header: { kind: "prop", version: 3, objects: 1, dependencies: [], patches: 0, deleted: [] },
    rows: [],
    object: null,
    readOnly: null,
    declared: DECLARED,
    ...overrides,
  };
}

let declared: DeclaredState | null;
let installed: Record<string, GameFileEntry>;

function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => createTestQueryClient());
  return (
    <QueryClientProvider client={client}>
      <ProjectProvider project={PROJECT}>
        <RouteSandboxProvider project={PROJECT.path}>
          <ToastProvider>{children}</ToastProvider>
        </RouteSandboxProvider>
      </ProjectProvider>
    </QueryClientProvider>
  );
}

/** Open `tab` in the editor and draw its options, as its toolbar does. */
function drawTab(tab: ContentDocument, handle: BinDocumentHandle) {
  useWorkshopEditorStore.getState().openDocument(PROJECT.path, tab);
  const sandbox = "sandbox" in tab ? tab.sandbox : undefined;
  return render(
    <DocumentSandboxProvider sandbox={sandbox}>
      <SandboxOptions documentId={tab.id} handle={handle} />
    </DocumentSandboxProvider>,
    { wrapper: Providers },
  );
}

function openTabs(): readonly ContentDocument[] {
  return Object.values(useWorkshopEditorStore.getState().byProject[PROJECT.path]?.documents ?? {});
}

const CHUNK_TAB = objectDocument(CHUNK, ENTRY, "Characters/Teemo/Skins/Skin0", SKIN_PATH);

beforeEach(() => {
  useWorkshopEditorStore.setState({ byProject: { [PROJECT.path]: EMPTY_EDITOR } });
  declared = DECLARED;
  installed = {};
  useWorkshopEditorStore.getState().selectModule(PROJECT.path, null);
  useWorkshopEditorStore.getState().selectLayer(PROJECT.path, "base");
  mockInvoke.mockReset();
  mockInvoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
    if (command === commandNames.bin.binDeclared)
      return Promise.resolve({ ok: true, value: declared });
    if (command === commandNames.bin.binDeclareInto) {
      declared = {
        ...DECLARED,
        layer: args?.layer as string,
        module: args?.module as DeclaredModuleChoice,
      };
      return Promise.resolve({ ok: true, value: declared });
    }
    if (command === commandNames.game.locateGameFiles)
      return Promise.resolve({ ok: true, value: installed });
    return Promise.reject(new Error(`unexpected command ${command}`));
  });
});

async function openOptions(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Sandbox" }));
}

describe("the Sandbox options of a declared document", () => {
  it("name the project's sandbox and check the layer edits declare into", async () => {
    const user = userEvent.setup();
    drawTab(CHUNK_TAB, openBin());

    expect(await screen.findByRole("button", { name: "Sandbox" })).toHaveTextContent(
      "Sandbox (Jade Teemo)",
    );
    await openOptions(user);

    expect(await screen.findByRole("menuitemradio", { name: "Base" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemradio", { name: "Jade Teemo" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("declare into the layer the options pick", async () => {
    const user = userEvent.setup();
    drawTab(CHUNK_TAB, openBin());

    await openOptions(user);
    await user.click(await screen.findByRole("menuitemradio", { name: "Chroma" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(commandNames.bin.binDeclareInto, {
        document: DOCUMENT,
        layer: "chroma",
        module: { kind: "auto" },
      }),
    );
    expect(await screen.findByRole("menuitemradio", { name: "Chroma" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("lock the module while the project's declarations are off, and turn them back on", async () => {
    const user = userEvent.setup();
    drawTab(CHUNK_TAB, openBin({ readOnly: "declarationsOff" }));

    await openOptions(user);
    expect(await screen.findByRole("menuitemradio", { name: "Glow" })).toBeDisabled();

    const toggle = screen.getByRole("menuitemcheckbox", { name: "Use game data declarations" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await user.click(toggle);

    expect(useWorkshopEditorStore.getState().byProject[PROJECT.path]?.useDeclarations).toBe(true);
  });

  it("join the module picked, automatic until one is", async () => {
    const user = userEvent.setup();
    drawTab(CHUNK_TAB, openBin());

    await openOptions(user);
    expect(await screen.findByRole("menuitemradio", { name: "Automatic" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemradio", { name: "Module 1" })).toBeEnabled();
    expect(screen.getByRole("menuitemradio", { name: "Module 3" })).toBeDisabled();
    await user.click(screen.getByRole("menuitemradio", { name: "Glow" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(commandNames.bin.binDeclareInto, {
        document: DOCUMENT,
        layer: "base",
        module: { kind: "index", index: 1 },
      }),
    );
  });

  it("start a new module from a name typed in place", async () => {
    const user = userEvent.setup();
    drawTab(CHUNK_TAB, openBin());

    await openOptions(user);
    await user.click(await screen.findByRole("button", { name: "New module" }));
    await user.type(screen.getByRole("textbox", { name: "Module name" }), "Blue{Enter}");

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(commandNames.bin.binDeclareInto, {
        document: DOCUMENT,
        layer: "base",
        module: { kind: "new", name: "Blue" },
      }),
    );
  });
});

/* Acceptance test 5 of docs/plans/sandbox.md: picking the game opens the game's copy
   read-only in the same tab, and the choice is disabled for a path only a layer holds. */
describe("the sandbox choice", () => {
  it("switches a game bin's tab to the game sandbox in place", async () => {
    const user = userEvent.setup();
    drawTab(CHUNK_TAB, openBin());

    await openOptions(user);
    await user.click(await screen.findByRole("menuitemradio", { name: "Game" }));

    expect(openTabs()).toEqual([
      expect.objectContaining({
        id: `object@game:${CHUNK_TAB.id.slice("object:".length)}`,
        asset: CHUNK,
        sandbox: { kind: "game" },
      }),
    ]);
  });

  it("switches a layer file's tab to the install's copy of its path", async () => {
    installed = {
      [SKIN_PATH]: {
        pathHash: "00cd",
        path: SKIN_PATH,
        sizeBytes: 64,
        wad: "Champions/Teemo.wad.client",
      },
    };
    const user = userEvent.setup();
    const tab = objectDocument(LAYER_FILE, ENTRY, "Characters/Teemo/Skins/Skin0", SKIN_PATH);
    drawTab(tab, openBin({ asset: LAYER_FILE, declared: null }));
    declared = null;

    await openOptions(user);
    const game = await screen.findByRole("menuitemradio", { name: "Game" });
    await waitFor(() => expect(game).toBeEnabled());
    await user.click(game);

    expect(openTabs()).toEqual([
      expect.objectContaining({
        asset: { kind: "gameChunk", wad: "Champions/Teemo.wad.client", pathHash: "00cd" },
        sandbox: { kind: "game" },
      }),
    ]);
  });

  it("disables the game for a path only a layer holds", async () => {
    const user = userEvent.setup();
    const tab = objectDocument(LAYER_FILE, ENTRY, "Mods/Jade/Glow", SKIN_PATH);
    declared = null;
    drawTab(tab, openBin({ asset: LAYER_FILE, declared: null }));

    await openOptions(user);

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(commandNames.game.locateGameFiles, {
        paths: [SKIN_PATH],
      }),
    );
    expect(await screen.findByRole("menuitemradio", { name: "Game" })).toBeDisabled();
  });

  it("switches a game tab back to the project's sandbox", async () => {
    const user = userEvent.setup();
    const tab = objectDocument(CHUNK, ENTRY, "Characters/Teemo/Skins/Skin0", SKIN_PATH, null, {
      kind: "game",
    });
    declared = null;
    drawTab(tab, openBin({ sandbox: { kind: "game" }, readOnly: "gameSandbox", declared: null }));

    expect(await screen.findByRole("button", { name: "Sandbox" })).toHaveTextContent(
      "Sandbox (Game)",
    );
    await openOptions(user);
    await user.click(await screen.findByRole("menuitemradio", { name: "Jade Teemo" }));

    expect(openTabs()).toEqual([expect.objectContaining({ id: CHUNK_TAB.id })]);
    expect(openTabs()[0]).not.toHaveProperty("sandbox");
  });
});

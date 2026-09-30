// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { ToastProvider } from "@/components";
import type { BinRow, DeclaredModuleChoice, DeclaredState, WorkshopProject } from "@/lib/tauri";
import { commandNames } from "@/test/commandNames";
import { mockInvoke } from "@/test/mocks/tauri";
import { createTestQueryClient } from "@/test/utils";

import { ProjectProvider } from "../../../../projects/state/ProjectContext";
import { EMPTY_EDITOR, useWorkshopEditorStore } from "../../../../state";
import { BinRowLine } from "../../../tree/components/BinRow";
import type { RowLine } from "../../../tree/utils/binRows";
import { DeclaredRowsContext, useDeclaredRows } from "../../hooks/useDeclared";
import { BinEditState } from "../BinEditState";

const ENTRY = "0x2a1f3c7d";
const GLOW = "0000000a.0000000b";
const DOCUMENT = 7;

const PROJECT: WorkshopProject = {
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

const DECLARED: DeclaredState = {
  layer: "base",
  module: { kind: "auto" },
  modules: [
    { index: 0, name: null, takesKeys: true },
    { index: 1, name: "Glow", takesKeys: true },
    { index: 2, name: null, takesKeys: false },
  ],
  layers: ["base", "chroma"],
  marks: [
    {
      entry: ENTRY,
      path: GLOW,
      property: "skinMeshProperties.selfIllumination",
      module: 1,
      moduleName: "Glow",
      sign: "set",
      whole: false,
      reference: null,
      game: "0.0",
    },
  ],
  objects: [],
  links: [],
  diagnostics: [
    {
      entry: ENTRY,
      path: GLOW,
      layer: "base",
      key: "skinMeshProperties.selfIllumination",
      kind: "propertyEditSkipped",
      reason: "kindMismatch",
      object: null,
      detail: null,
    },
    {
      entry: "",
      path: "",
      layer: "chroma",
      key: "-links",
      kind: "linkRemovalUnmatched",
      reason: null,
      object: null,
      detail: null,
    },
  ],
};

function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => createTestQueryClient());
  return (
    <QueryClientProvider client={client}>
      <ProjectProvider project={PROJECT}>
        <ToastProvider>{children}</ToastProvider>
      </ProjectProvider>
    </QueryClientProvider>
  );
}

function glowLine(path: string): RowLine {
  const row: BinRow = {
    entry: ENTRY,
    path,
    label: "skinMeshProperties.selfIllumination",
    node: "property",
    name: "selfIllumination",
    unnamed: false,
    kind: "f32",
    value: { type: "float", value: 0.37 },
    declared: null,
  };
  return {
    kind: "row",
    key: `${ENTRY}:${path}`,
    row,
    depth: 1,
    expanded: false,
    loading: false,
    owner: null,
    parent: null,
    index: 0,
  };
}

function MarkedRows({ children }: { children: ReactNode }) {
  return (
    <DeclaredRowsContext value={useDeclaredRows(DOCUMENT, true)}>{children}</DeclaredRowsContext>
  );
}

let declared: DeclaredState | null;

beforeEach(() => {
  useWorkshopEditorStore.setState({ byProject: { [PROJECT.path]: EMPTY_EDITOR } });
  declared = DECLARED;
  useWorkshopEditorStore.getState().selectModule(PROJECT.path, null);
  useWorkshopEditorStore.getState().selectLayer(PROJECT.path, "base");
  mockInvoke.mockReset();
  mockInvoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
    if (command === commandNames.app.binDeclared)
      return Promise.resolve({ ok: true, value: declared });
    if (command === commandNames.app.binDeclareInto) {
      declared = {
        ...DECLARED,
        layer: args?.layer as string,
        module: args?.module as DeclaredModuleChoice,
        marks: [],
        diagnostics: [],
      };
      return Promise.resolve({ ok: true, value: declared });
    }
    return Promise.reject(new Error(`unexpected command ${command}`));
  });
});

describe("a declared row", () => {
  it("draws the mark on the row a declaration touches, and on no other", async () => {
    render(
      <MarkedRows>
        <BinRowLine line={glowLine(GLOW)} focused={false} onToggle={() => {}} />
        <BinRowLine line={glowLine("0000000a.0000000c")} focused={false} onToggle={() => {}} />
      </MarkedRows>,
      { wrapper: Providers },
    );

    expect(await screen.findAllByRole("img", { name: "Declared in Base" })).toHaveLength(1);
  });

  it("draws what the apply reported on the row it names", async () => {
    render(
      <MarkedRows>
        <BinRowLine line={glowLine(GLOW)} focused={false} onToggle={() => {}} />
        <BinRowLine line={glowLine("0000000a.0000000c")} focused={false} onToggle={() => {}} />
      </MarkedRows>,
      { wrapper: Providers },
    );

    expect(await screen.findAllByRole("img", { name: "1 apply diagnostic" })).toHaveLength(1);
  });
});

describe("the toolbar of a declared document", () => {
  const asset = { kind: "gameChunk", wad: "Champions/Teemo.wad.client", pathHash: "ab" } as const;

  it("draws a diagnostic that names no row in the toolbar", async () => {
    render(<BinEditState document={DOCUMENT} asset={asset} readOnly={null} onReload={() => {}} />, {
      wrapper: Providers,
    });

    expect(await screen.findByRole("img", { name: "1 apply diagnostic" })).toBeInTheDocument();
  });

  it("keeps the lock on a game bin of the game sandbox", async () => {
    declared = null;
    render(
      <BinEditState document={DOCUMENT} asset={asset} readOnly="gameSandbox" onReload={() => {}} />,
      { wrapper: Providers },
    );

    expect(await screen.findByText("Read-only")).toBeInTheDocument();
  });
});

// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { beforeEach, expect, it } from "vitest";

import type { DeclaredState, LayerOverride } from "@/lib/tauri";
import { commandNames } from "@/test/commandNames";
import { mockInvoke } from "@/test/mocks/tauri";
import { createTestQueryClient } from "@/test/utils";

import { ProjectProvider } from "../../../../projects/state/ProjectContext";
import { EMPTY_EDITOR, useWorkshopEditorStore } from "../../../../state";
import { PROJECT } from "../../../tree/components/__tests__/binEditFixtures";
import { OverriddenRowsContext, useOverriddenRows } from "../../hooks/useOverrides";
import { DeclaredRowState } from "../DeclaredLayer";

const DOCUMENT = 4;
const ENTRY = "0x2a1f3c7d";
const PATH = "0000000a";

const OVERRIDE: LayerOverride = {
  layer: "base",
  mark: {
    entry: ENTRY,
    path: PATH,
    property: "skinMeshProperties.selfIllumination",
    module: 0,
    moduleName: null,
    sign: "set",
    whole: false,
    reference: null,
    game: "0.0",
  },
  value: "0.37",
};

const DECLARED: DeclaredState = {
  layer: "base",
  module: { kind: "auto" },
  modules: [],
  layers: ["base", "chroma", "glow"],
  marks: [],
  objects: [],
  links: [],
  diagnostics: [],
};

let overrides: LayerOverride[] = [];
let declared: DeclaredState | null = null;

beforeEach(() => {
  overrides = [OVERRIDE];
  declared = null;
  useWorkshopEditorStore.setState({ byProject: {} });
  mockInvoke.mockReset();
  mockInvoke.mockImplementation((command) => {
    if (command === commandNames.bin.binOverrides)
      return Promise.resolve({ ok: true, value: overrides });
    if (command === commandNames.bin.binDeclared)
      return Promise.resolve({ ok: true, value: declared });
    return Promise.resolve({ ok: true, value: null });
  });
});

function declaredBy(layer: string, path = PATH): LayerOverride {
  return { ...OVERRIDE, layer, mark: { ...OVERRIDE.mark, path } };
}

function Rows({ children }: { children: ReactNode }) {
  return (
    <OverriddenRowsContext value={useOverriddenRows(DOCUMENT)}>{children}</OverriddenRowsContext>
  );
}

function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => createTestQueryClient());
  return (
    <QueryClientProvider client={client}>
      <ProjectProvider project={PROJECT}>
        <Rows>{children}</Rows>
      </ProjectProvider>
    </QueryClientProvider>
  );
}

/* Acceptance test 4 of docs/plans/sandbox.md, its frontend half: the row of a layer file a
   declaration overrides carries a mark naming the layer. */
it("marks a row of a layer file that a layer's game data overrides", async () => {
  render(<DeclaredRowState rowKey={`${ENTRY}:${PATH}`} />, { wrapper: Providers });

  expect(
    await screen.findByRole("img", { name: "The game data of base overrides this at build" }),
  ).toBeInTheDocument();
  expect(mockInvoke).toHaveBeenCalledWith(commandNames.bin.binOverrides, { document: DOCUMENT });
});

it("leaves a row no declaration overrides unmarked", async () => {
  render(<DeclaredRowState rowKey={`${ENTRY}:0000000b`} />, { wrapper: Providers });

  await waitFor(() =>
    expect(mockInvoke).toHaveBeenCalledWith(commandNames.bin.binOverrides, expect.anything()),
  );
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

it("marks a row of a declared document that a layer besides the target declares", async () => {
  declared = DECLARED;
  overrides = [declaredBy("base"), declaredBy("chroma"), declaredBy("base", "0000000b")];
  render(
    <>
      <DeclaredRowState rowKey={`${ENTRY}:${PATH}`} />
      <DeclaredRowState rowKey={`${ENTRY}:0000000b`} />
    </>,
    { wrapper: Providers },
  );

  expect(await screen.findByRole("img", { name: /chroma/ })).toBeInTheDocument();
  expect(screen.getAllByRole("img")).toHaveLength(1);
});

it("leaves the rows of a hidden layer unmarked", async () => {
  declared = DECLARED;
  overrides = [declaredBy("chroma"), declaredBy("glow", "0000000b")];
  useWorkshopEditorStore.setState({
    byProject: { [PROJECT.path]: { ...EMPTY_EDITOR, hiddenMarkLayers: ["chroma"] } },
  });
  render(
    <>
      <DeclaredRowState rowKey={`${ENTRY}:${PATH}`} />
      <DeclaredRowState rowKey={`${ENTRY}:0000000b`} />
    </>,
    { wrapper: Providers },
  );

  expect(await screen.findByRole("img", { name: /glow/ })).toBeInTheDocument();
  expect(screen.queryByRole("img", { name: /chroma/ })).not.toBeInTheDocument();
});

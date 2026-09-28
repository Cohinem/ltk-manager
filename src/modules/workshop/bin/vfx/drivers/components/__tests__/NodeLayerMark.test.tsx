// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { beforeEach, expect, it } from "vitest";

import type { DeclaredMark, LayerOverride } from "@/lib/tauri";
import { mockInvoke } from "@/test/mocks/tauri";
import { createTestQueryClient } from "@/test/utils";

import { ProjectProvider } from "../../../../../projects/state/ProjectContext";
import { type DeclaredRows, DeclaredRowsContext } from "../../../../documents/hooks/useDeclared";
import { OverriddenRowsContext, useOverriddenRows } from "../../../../documents/hooks/useOverrides";
import { PROJECT } from "../../../../tree/components/__tests__/binEditFixtures";
import { rowKey } from "../../../../tree/utils/binRows";
import { NodeLayerMark } from "../NodeLayerMark";

const DOCUMENT = 4;
const ENTRY = "0x2a1f3c7d";
const EMITTER = "0000000a[2]";
const FIELD = `${EMITTER}.0000000b`;
const OTHER_EMITTER = "0000000a[3]";

const MARK: DeclaredMark = {
  entry: ENTRY,
  path: FIELD,
  property: "complexEmitterDefinitionData[2].birthScale",
  module: 0,
  moduleName: null,
  sign: "set",
  whole: false,
  reference: null,
  game: "1",
};

const DECLARED: DeclaredRows = {
  layer: "base",
  marks: new Map([[rowKey(MARK), MARK]]),
  within: new Set(["", "0000000a", EMITTER].map((path) => rowKey({ entry: ENTRY, path }))),
  diagnostics: new Map(),
  objects: new Map(),
  links: new Map(),
  editable: true,
};

let overrides: LayerOverride[] = [];

beforeEach(() => {
  overrides = [];
  mockInvoke.mockReset();
  mockInvoke.mockImplementation((command) => {
    if (command === "bin_overrides") return Promise.resolve({ ok: true, value: overrides });
    return Promise.resolve({ ok: true, value: null });
  });
});

function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => createTestQueryClient());
  return (
    <QueryClientProvider client={client}>
      <ProjectProvider project={PROJECT}>{children}</ProjectProvider>
    </QueryClientProvider>
  );
}

function Declared({ path }: { path: string }) {
  return (
    <DeclaredRowsContext value={DECLARED}>
      <NodeLayerMark rowKey={rowKey({ entry: ENTRY, path })} />
    </DeclaredRowsContext>
  );
}

function Overridden({ path }: { path: string }) {
  return (
    <OverriddenRowsContext value={useOverriddenRows(DOCUMENT)}>
      <NodeLayerMark rowKey={rowKey({ entry: ENTRY, path })} />
    </OverriddenRowsContext>
  );
}

function overrideBy(layer: string): LayerOverride {
  return { layer, mark: MARK, value: "2" };
}

it("marks a node whose rows a declaration of the chosen layer sets", () => {
  render(<Declared path={EMITTER} />, { wrapper: Providers });

  expect(
    screen.getByRole("img", { name: "base declares values in this node" }),
  ).toBeInTheDocument();
});

it("marks the node of a declared row itself", () => {
  render(<Declared path={FIELD} />, { wrapper: Providers });

  expect(
    screen.getByRole("img", { name: "base declares values in this node" }),
  ).toBeInTheDocument();
});

it("leaves a node no declaration reaches unmarked", () => {
  render(<Declared path={OTHER_EMITTER} />, { wrapper: Providers });

  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

it("marks a node of a layer file with the last layer that overrides a row under it", async () => {
  overrides = [overrideBy("base"), overrideBy("skins")];
  render(<Overridden path={EMITTER} />, { wrapper: Providers });

  const mark = await screen.findByRole("img", {
    name:
      "The game data of base overrides values in this node at build " +
      "The game data of skins overrides values in this node at build",
  });
  expect(mark).toHaveAttribute("data-layer-mark", "skins");
});

it("leaves a node of a layer file no override reaches unmarked", async () => {
  overrides = [overrideBy("base")];
  render(<Overridden path={OTHER_EMITTER} />, { wrapper: Providers });

  await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("bin_overrides", expect.anything()));
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

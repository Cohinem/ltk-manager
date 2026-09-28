// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { beforeEach, expect, it } from "vitest";

import type { LayerOverride } from "@/lib/tauri";
import { mockInvoke } from "@/test/mocks/tauri";
import { createTestQueryClient } from "@/test/utils";

import { ProjectProvider } from "../../../../projects/state/ProjectContext";
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

let overrides: LayerOverride[] = [];

beforeEach(() => {
  overrides = [OVERRIDE];
  mockInvoke.mockReset();
  mockInvoke.mockImplementation((command) => {
    if (command === "bin_overrides") return Promise.resolve({ ok: true, value: overrides });
    return Promise.resolve({ ok: true, value: null });
  });
});

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
  expect(mockInvoke).toHaveBeenCalledWith("bin_overrides", { document: DOCUMENT });
});

it("leaves a row no declaration overrides unmarked", async () => {
  render(<DeclaredRowState rowKey={`${ENTRY}:0000000b`} />, { wrapper: Providers });

  await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("bin_overrides", expect.anything()));
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components";
import type { AssetRef, WorkshopProject } from "@/lib/tauri";
import { mockInvoke } from "@/test/mocks/tauri";
import { createTestQueryClient } from "@/test/utils";

import { ProjectProvider } from "../../../../projects/state/ProjectContext";
import { nameHash } from "../../../shared/utils/binHash";
import { elementLayout } from "../../utils/classLayouts";
import { ClassView } from "../ClassView";

/** A canvas that says whether the layout's edit scope reached it. */
vi.mock("../../../atlas/canvas/AtlasCanvas", async () => {
  const { useAtlasEdit } = await import("../../../atlas/state/atlasEdit");
  return {
    AtlasCanvas: () => {
      const edit = useAtlasEdit();
      if (edit === null) return <div>canvas unscoped</div>;
      return <div>{edit.editable ? "canvas editable" : "canvas read-only"}</div>;
    },
  };
});

const ASSET: AssetRef = {
  kind: "gameChunk",
  wad: "DATA/FINAL/UI.wad.client",
  pathHash: "00aa",
};

const PROJECT: WorkshopProject = {
  path: "C:/mods/hud",
  name: "hud",
  displayName: "Hud",
  version: "1.0.0",
  description: "",
  authors: [],
  tags: [],
  champions: [],
  maps: [],
  layers: [],
  thumbnailPath: null,
  lastModified: "2026-09-29T21:14:02Z",
  location: "workshop",
  lastOpened: null,
  id: "id-hud",
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

function renderElement(editable: boolean) {
  render(
    <ClassView
      document={4}
      asset={ASSET}
      editable={editable}
      roots={[]}
      classHash={nameHash("UiElementIconData")}
      layout={elementLayout}
      objectName={() => "ClientStates/Gameplay/UX/Hud/Icon"}
      onNotOpen={() => {}}
      onShowInProperties={vi.fn()}
    />,
    { wrapper: Providers },
  );
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(() =>
    Promise.resolve({ ok: false, error: { code: "UNKNOWN", detail: "" } }),
  );
});

describe("ClassView over a UI element", () => {
  it("hands the canvas the tab's edits", async () => {
    renderElement(true);

    expect(await screen.findByText("canvas editable")).toBeInTheDocument();
  });

  it("hands the canvas a read-only scope where the tab takes no edits", async () => {
    renderElement(false);

    expect(await screen.findByText("canvas read-only")).toBeInTheDocument();
  });
});

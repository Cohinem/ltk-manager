// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AssetRef } from "@/lib/tauri";
import type { BackdropFlags } from "@/modules/viewport";
import { backdropFlags } from "@/test/mapBackdrop";

import { MapVisibilityPane } from "../MapVisibilityPane";

const MATERIALS: AssetRef = { kind: "gameChunk", wad: "Map11.wad.client", pathHash: "00ff" };
const openDocument = vi.fn();

/* What the scene holds, which each case sets before it renders. */
const scene: { backdrop: BackdropFlags; materialsAsset: AssetRef | null } = {
  backdrop: backdropFlags(),
  materialsAsset: MATERIALS,
};

vi.mock("../../state/mapScene", () => ({
  useMapScene: () => ({
    backdrop: scene.backdrop,
    materialsAsset: scene.materialsAsset,
    chosen: { skin: null, map: "Maps/MapGeometry/Map11/Base_SRX" },
  }),
}));

vi.mock("../../../../state", () => ({
  clickIntent: () => "open",
  useOpenDocumentAs: () => openDocument,
}));

afterEach(() => {
  cleanup();
  openDocument.mockClear();
  scene.backdrop = backdropFlags();
  scene.materialsAsset = MATERIALS;
});

describe("MapVisibilityPane", () => {
  it("lists the layers and the controllers of the scene's map", () => {
    render(<MapVisibilityPane />);

    expect(screen.getByRole("checkbox", { name: "Layer 4" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Layer 4 0x3c5b24f7" })).toBeTruthy();
  });

  it("sets a controller of the scene to the state the reader ticks", async () => {
    render(<MapVisibilityPane />);

    await userEvent.click(screen.getByRole("checkbox", { name: "Layer 4 0x3c5b24f7" }));

    expect(scene.backdrop.setController).toHaveBeenCalledWith("0x3c5b24f7", true);
  });

  it("resets while a flag or a controller is customized, and not otherwise", async () => {
    const { unmount } = render(<MapVisibilityPane />);
    const idle = screen.getByRole("button", { name: "Reset to the map's visibility" });
    expect((idle as HTMLButtonElement).disabled).toBe(true);
    unmount();

    scene.backdrop = backdropFlags({ customized: true });
    render(<MapVisibilityPane />);
    await userEvent.click(screen.getByRole("button", { name: "Reset to the map's visibility" }));

    expect(scene.backdrop.reset).toHaveBeenCalledOnce();
  });

  it("opens the object of a controller in the map's materials file", async () => {
    render(<MapVisibilityPane />);

    const [first] = screen.getAllByRole("button", { name: "Open the controller object" });
    if (first !== undefined) await userEvent.click(first);

    expect(openDocument).toHaveBeenCalledOnce();
    expect(openDocument.mock.calls[0]?.[0]).toMatchObject({
      kind: "object",
      asset: MATERIALS,
      objectHash: "0x3c5b24f7",
      file: "Maps/MapGeometry/Map11/Base_SRX.materials.bin",
    });
  });

  it("has no open action while the map has no materials file", () => {
    scene.materialsAsset = null;
    render(<MapVisibilityPane />);

    expect(screen.queryByRole("button", { name: "Open the controller object" })).toBeNull();
  });
});

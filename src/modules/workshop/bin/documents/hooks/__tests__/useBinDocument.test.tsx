// @vitest-environment happy-dom

import { render, waitFor } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";

import type { AssetRef } from "@/lib/tauri";
import { mockInvoke } from "@/test/mocks/tauri";

import { ProjectProvider } from "../../../../projects/state/ProjectContext";
import { PROJECT } from "../../../tree/components/__tests__/binEditFixtures";
import { useBinDocument } from "../useBinDocument";

const ASSET: AssetRef = { kind: "gameChunk", wad: "Ahri.wad.client", pathHash: "00aa" };

function Open() {
  useBinDocument(ASSET, "0x12345678");
  return null;
}

beforeEach(() => {
  mockInvoke.mockReset();
  let document = 0;
  mockInvoke.mockImplementation((command) => {
    if (command === "bin_open") {
      return Promise.resolve({ ok: true, value: { document: ++document } });
    }

    return Promise.resolve({ ok: true, value: null });
  });
});

it("opens game data in the current mod project and reopens when that project changes", async () => {
  const view = (path: string) => (
    <ProjectProvider project={{ ...PROJECT, path }}>
      <Open />
    </ProjectProvider>
  );
  const { rerender } = render(view("C:/mods/first"));

  await waitFor(() =>
    expect(mockInvoke).toHaveBeenCalledWith("bin_open", {
      asset: { ...ASSET, project: "C:/mods/first" },
      entry: "0x12345678",
    }),
  );

  rerender(view("C:/mods/second"));

  await waitFor(() =>
    expect(mockInvoke).toHaveBeenCalledWith("bin_open", {
      asset: { ...ASSET, project: "C:/mods/second" },
      entry: "0x12345678",
    }),
  );
  expect(mockInvoke).toHaveBeenCalledWith("bin_close", { document: 1 });
});

it("leaves a standalone game chunk without declaration ownership", async () => {
  render(<Open />);

  await waitFor(() =>
    expect(mockInvoke).toHaveBeenCalledWith("bin_open", {
      asset: ASSET,
      entry: "0x12345678",
    }),
  );
});

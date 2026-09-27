// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, type Mock } from "vitest";

import { assetVersion, currentAssetVersions } from "@/lib/assetVersions";
import type { AssetRef, LayerFilesChanged } from "@/lib/tauri";
import { mockInvoke, mockListen } from "@/test/mocks/tauri";

import { previewKeys } from "../../api/queries";
import { LAYER_FILES_CHANGED } from "../../utils/layerChanges";
import { useLayerFileReload } from "../useLayerFileReload";

const PROJECT = "C:/mods/reload-hook";

const ICON: AssetRef = { kind: "layer", project: PROJECT, layer: "base", path: "icon.tex" };

const OTHER: AssetRef = { kind: "layer", project: PROJECT, layer: "base", path: "other.tex" };

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue({ ok: true, value: null });
  mockListen.mockClear();
});

function renderReload() {
  /* Kept past the render, where the shared test client collects a query nothing observes. */
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  client.setQueryData(previewKeys.info(ICON), { kind: "texture" });
  client.setQueryData(previewKeys.info(OTHER), { kind: "texture" });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useLayerFileReload(PROJECT), { wrapper });
  return { client, ...hook };
}

function announce(change: LayerFilesChanged) {
  const call = (mockListen as Mock).mock.calls.find(([name]) => name === LAYER_FILES_CHANGED);
  const listener = call![1] as (event: { payload: LayerFilesChanged }) => void;
  act(() => listener({ payload: change }));
}

it("acquires a watch on the project's layers while mounted", async () => {
  const { unmount } = renderReload();
  await act(() => Promise.resolve());

  expect(mockInvoke).toHaveBeenCalledWith("watch_project_layers", { projectPath: PROJECT });

  unmount();
  expect(mockInvoke).toHaveBeenCalledWith("unwatch_project_layers", { projectPath: PROJECT });
});

it("counts a version for a changed file and marks only its info stale", async () => {
  const { client } = renderReload();
  await act(() => Promise.resolve());

  announce({ project: PROJECT, files: [{ layer: "base", path: "icon.tex" }] });

  expect(assetVersion(currentAssetVersions(), ICON)).toBe(1);
  expect(assetVersion(currentAssetVersions(), OTHER)).toBe(0);
  expect(client.getQueryState(previewKeys.info(ICON))?.isInvalidated).toBe(true);
  expect(client.getQueryState(previewKeys.info(OTHER))?.isInvalidated).toBe(false);
});

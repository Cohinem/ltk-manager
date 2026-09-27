// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  assetVersion,
  bumpAssetVersions,
  currentAssetVersions,
  layerFileKey,
  useAssetVersion,
  versionedUrl,
} from "@/lib/assetVersions";
import { previewUrl, usePreviewUrl } from "@/lib/previewUrl";
import type { AssetRef } from "@/lib/tauri";

const PROJECT = "C:\\mods\\Smolder X";

function layerAsset(path: string): AssetRef {
  return { kind: "layer", project: PROJECT, layer: "base", path };
}

function bump(...paths: string[]) {
  bumpAssetVersions({
    project: PROJECT,
    files: paths.map((path) => ({ layer: "base", path })),
  });
}

describe("versionedUrl", () => {
  it("leaves the url of an asset that never changed untouched", () => {
    expect(versionedUrl("http://ltk-asset.localhost/abc", 0)).toBe(
      "http://ltk-asset.localhost/abc",
    );
  });

  it("adds the version as the first or a further query parameter", () => {
    expect(versionedUrl("http://ltk-asset.localhost/abc", 2)).toBe(
      "http://ltk-asset.localhost/abc?v=2",
    );
    expect(versionedUrl("http://ltk-asset.localhost/abc?w=64", 3)).toBe(
      "http://ltk-asset.localhost/abc?w=64&v=3",
    );
  });
});

describe("bumpAssetVersions", () => {
  it("counts a change for the files it names and none for the rest", () => {
    const changed = layerAsset("bump/changed.tex");
    const untouched = layerAsset("bump/untouched.tex");

    bump("bump/changed.tex");
    bump("bump/changed.tex");

    const versions = currentAssetVersions();
    expect(assetVersion(versions, changed)).toBe(2);
    expect(assetVersion(versions, untouched)).toBe(0);
  });

  it("matches a link's spelling of the path however it is cased or slashed", () => {
    bump("Fold/Icon.TEX");

    const asset: AssetRef = {
      kind: "layer",
      project: "c:/mods/smolder x/",
      layer: "BASE",
      path: "fold\\icon.tex",
    };
    expect(assetVersion(currentAssetVersions(), asset)).toBe(1);
    expect(layerFileKey(PROJECT, "base", "Fold/Icon.TEX")).toBe(
      layerFileKey("c:/mods/smolder x", "BASE", "fold\\icon.tex"),
    );
  });

  it("leaves a game chunk and a loose file at version 0", () => {
    const chunk: AssetRef = { kind: "gameChunk", wad: "a.wad.client", pathHash: "0123" };
    const loose: AssetRef = { kind: "file", path: "C:\\mods\\Smolder X\\content\\base\\x.tex" };

    bump("x.tex");

    expect(assetVersion(currentAssetVersions(), chunk)).toBe(0);
    expect(assetVersion(currentAssetVersions(), loose)).toBe(0);
  });

  it("keeps the same map when a change names no file", () => {
    const before = currentAssetVersions();

    bumpAssetVersions({ project: PROJECT, files: [] });

    expect(currentAssetVersions()).toBe(before);
  });
});

describe("usePreviewUrl", () => {
  it("gives a changed file a new url and leaves another file's alone", () => {
    const changed = layerAsset("hook/changed.tex");
    const other = layerAsset("hook/other.tex");
    const first = renderHook(() => usePreviewUrl(changed, 64));
    const second = renderHook(() => usePreviewUrl(other, 64));
    const otherBefore = second.result.current;
    expect(first.result.current).toBe(previewUrl(changed, 64));

    act(() => bump("hook/changed.tex"));

    expect(first.result.current).toBe(`${previewUrl(changed, 64)}&v=1`);
    expect(second.result.current).toBe(otherBefore);
  });

  it("re-renders a subscriber to one file only when that file changes", () => {
    const watched = layerAsset("render/watched.tex");
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useAssetVersion(watched);
    });
    const settled = renders;

    act(() => bump("render/elsewhere.tex"));
    expect(renders).toBe(settled);

    act(() => bump("render/watched.tex"));
    expect(result.current).toBe(1);
    expect(renders).toBe(settled + 1);
  });
});

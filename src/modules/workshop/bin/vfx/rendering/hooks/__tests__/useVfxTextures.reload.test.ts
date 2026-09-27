// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react";
import { Texture, TextureLoader } from "three";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { bumpAssetVersions } from "@/lib/assetVersions";

import type { EmitterModel } from "../../../engine/model/model";
import type { DrawnEmitter } from "../../utils/definitions";
import { useVfxTextures } from "../useVfxTextures";

vi.mock("../../../../../preview/utils/assetRef", () => ({
  previewUrl: (asset: { path: string }) => `https://asset.test/${asset.path}`,
}));

const PROJECT = "C:/mods/reload";

function layerFile(path: string) {
  return { path, asset: { kind: "layer", project: PROJECT, layer: "base", path } };
}

const drawn = [
  {
    key: "emitter",
    emitter: {
      texture: layerFile("spark.dds"),
      multTexture: layerFile("mult.dds"),
      colorTexture: null,
      palette: null,
      erosion: null,
      distortion: null,
      reflection: null,
    } as unknown as EmitterModel,
  },
] as DrawnEmitter[];

/* The cache keeps a released texture for a grace period, which a test runs out so the
   next one starts on an empty cache. */
const RELEASE_GRACE_MS = 15_000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function loadsByUrl() {
  const pending = new Map<string, (texture: Texture<HTMLImageElement>) => void>();
  const load = vi.spyOn(TextureLoader.prototype, "load").mockImplementation((url, onLoad) => {
    pending.set(url, onLoad!);
    return new Texture<HTMLImageElement>();
  });
  return { pending, load };
}

it("reloads only the slot whose file changed, drawing the old texture until the new one lands", async () => {
  const { pending, load } = loadsByUrl();
  const { result } = renderHook(() => useVfxTextures(drawn));

  const spark = new Texture<HTMLImageElement>();
  const mult = new Texture<HTMLImageElement>();
  await act(async () => {
    pending.get("https://asset.test/spark.dds")!(spark);
    pending.get("https://asset.test/mult.dds")!(mult);
  });
  const sparkDisposed = vi.spyOn(spark, "dispose");

  act(() => bumpAssetVersions({ project: PROJECT, files: [{ layer: "base", path: "spark.dds" }] }));

  expect(load).toHaveBeenCalledTimes(3);
  expect(load.mock.calls[2]![0]).toBe("https://asset.test/spark.dds?v=1");
  expect(result.current.get("emitter")).toMatchObject({ base: spark, mult });

  const saved = new Texture<HTMLImageElement>();
  await act(async () => pending.get("https://asset.test/spark.dds?v=1")!(saved));

  expect(result.current.get("emitter")).toMatchObject({ base: saved, mult });
  vi.advanceTimersByTime(RELEASE_GRACE_MS);
  expect(sparkDisposed).toHaveBeenCalledOnce();
});

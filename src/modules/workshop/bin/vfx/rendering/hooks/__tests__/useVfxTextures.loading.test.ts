// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react";
import { Texture, TextureLoader } from "three";
import { afterEach, expect, it, vi } from "vitest";

import type { EmitterModel } from "../../../engine/model/model";
import type { DrawnEmitter } from "../../utils/definitions";
import { useVfxTextures } from "../useVfxTextures";

vi.mock("../../../../../preview/utils/assetRef", () => ({
  previewUrl: (_asset: unknown, width?: number) => `https://asset.test/texture?w=${width}`,
}));

const named = {
  path: "texture.dds",
  asset: { kind: "gameChunk", wad: "test", pathHash: "texture" },
};
const drawn = [
  {
    key: "emitter",
    emitter: {
      texture: named,
      multTexture: named,
      colorTexture: named,
      palette: null,
      erosion: null,
      distortion: null,
      reflection: null,
    } as unknown as EmitterModel,
  },
] as DrawnEmitter[];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("limits small previews to two texture requests and disposes late arrivals after cancellation", async () => {
  const pending: ((texture: Texture<HTMLImageElement>) => void)[] = [];
  const load = vi.spyOn(TextureLoader.prototype, "load").mockImplementation((_url, onLoad) => {
    pending.push(onLoad!);
    return new Texture<HTMLImageElement>();
  });
  const { unmount } = renderHook(() => useVfxTextures(drawn, undefined, 128));
  expect(load).toHaveBeenCalledTimes(2);
  expect(load.mock.calls[0]![0]).toContain("w=128");

  const landed = new Texture<HTMLImageElement>();
  const disposed = vi.spyOn(landed, "dispose");
  await act(async () => pending[0]!(landed));
  expect(load).toHaveBeenCalledTimes(3);

  unmount();
  expect(disposed).toHaveBeenCalledOnce();
  const late = new Texture<HTMLImageElement>();
  const lateDisposed = vi.spyOn(late, "dispose");
  await act(async () => pending[1]!(late));
  expect(lateDisposed).toHaveBeenCalledOnce();
  expect(load).toHaveBeenCalledTimes(3);
});

it("does not start queued texture work after its preview is removed", async () => {
  const pending: ((texture: Texture<HTMLImageElement>) => void)[] = [];
  const load = vi.spyOn(TextureLoader.prototype, "load").mockImplementation((_url, onLoad) => {
    pending.push(onLoad!);
    return new Texture<HTMLImageElement>();
  });
  const { unmount } = renderHook(() => useVfxTextures(drawn, undefined, 128));
  unmount();
  await act(async () => pending[0]!(new Texture<HTMLImageElement>()));
  expect(load).toHaveBeenCalledTimes(2);
});

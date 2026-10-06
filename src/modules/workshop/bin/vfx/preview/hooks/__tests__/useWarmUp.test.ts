// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react";
import { Texture, TextureLoader } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NamedAsset } from "@/lib/tauri";

import type { EmitterModel } from "../../../engine/model/model";
import { useVfxMeshes } from "../../../rendering/hooks/useVfxMeshes";
import { useVfxTextures } from "../../../rendering/hooks/useVfxTextures";
import type { DrawnEmitter } from "../../../rendering/utils/definitions";
import { useWarmUp, WARM_UP_LIMIT_MS } from "../useWarmUp";

const SPARK: NamedAsset = { path: "spark.dds", asset: { kind: "file", path: "C:/spark.dds" } };

const NO_SYSTEM: readonly DrawnEmitter[] = [];

/** One drawn emitter with no mesh, and `texture` as its only texture. */
function drawn(texture: NamedAsset | null): DrawnEmitter[] {
  return [
    {
      key: "0",
      path: "",
      root: 0,
      rank: 0,
      emitter: {
        texture,
        multTexture: null,
        colorTexture: null,
        palette: null,
        erosion: null,
        distortion: null,
        reflection: null,
        mesh: null,
      } as EmitterModel,
    },
  ];
}

/** `useWarmUp` with the texture and mesh hooks it takes reports from, as the viewport calls them. */
function renderWarmUp(first: readonly DrawnEmitter[]) {
  const setWarming = vi.fn();
  const view = renderHook(
    ({ definitions }) => {
      const { reportTextures, reportMeshes } = useWarmUp(definitions, setWarming);
      useVfxTextures(definitions, reportTextures);
      useVfxMeshes(definitions, reportMeshes);
    },
    { initialProps: { definitions: first } },
  );
  const load = (definitions: readonly DrawnEmitter[]) => view.rerender({ definitions });

  return { setWarming, load };
}

/* The texture cache keeps a released texture for this long. Each test advances the timers
   past it, so the next test starts with an empty cache. */
const RELEASE_GRACE_MS = 15_000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  cleanup();
  vi.advanceTimersByTime(RELEASE_GRACE_MS);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useWarmUp", () => {
  it("does not pause the run while no system is loaded", () => {
    const { setWarming } = renderWarmUp(NO_SYSTEM);

    expect(setWarming).not.toHaveBeenCalled();
  });

  it("ends immediately when a system with no texture or mesh loads after the mount", () => {
    const { setWarming, load } = renderWarmUp(NO_SYSTEM);

    load(drawn(null));

    expect(setWarming).toHaveBeenLastCalledWith(false);
  });

  it("ends immediately when the system is already loaded at the mount", () => {
    const { setWarming } = renderWarmUp(drawn(null));

    expect(setWarming).toHaveBeenLastCalledWith(false);
  });

  it("pauses the run until the texture loads, for a system with no mesh", async () => {
    let finish: ((texture: Texture<HTMLImageElement>) => void) | undefined;
    vi.spyOn(TextureLoader.prototype, "load").mockImplementation((_url, loaded) => {
      finish = loaded;
      return new Texture<HTMLImageElement>();
    });
    const { setWarming, load } = renderWarmUp(NO_SYSTEM);

    load(drawn(SPARK));
    expect(setWarming).toHaveBeenLastCalledWith(true);

    await act(async () => {
      finish!(new Texture<HTMLImageElement>());
    });
    expect(setWarming).toHaveBeenLastCalledWith(false);
  });

  it("ends at the limit when a texture never loads", () => {
    vi.spyOn(TextureLoader.prototype, "load").mockImplementation(
      () => new Texture<HTMLImageElement>(),
    );
    const { setWarming, load } = renderWarmUp(NO_SYSTEM);
    load(drawn(SPARK));

    act(() => {
      vi.advanceTimersByTime(WARM_UP_LIMIT_MS - 1);
    });
    expect(setWarming).toHaveBeenLastCalledWith(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(setWarming).toHaveBeenLastCalledWith(false);
  });
});

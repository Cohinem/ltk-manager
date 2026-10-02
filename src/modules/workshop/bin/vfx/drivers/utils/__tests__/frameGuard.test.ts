import type { RenderCallback, RootState } from "@react-three/fiber";
import { Scene } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { guardFrames, watchFailure } from "../frameGuard";

function stateOf(scene: Scene): RootState {
  return { scene } as unknown as RootState;
}

describe("guardFrames", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides the scene of a callback that throws and reports the error", () => {
    const scene = new Scene();
    const heard = vi.fn();
    const stop = watchFailure(scene, heard);
    const error = new Error("texture upload");
    const ref = {
      current: (() => {
        throw error;
      }) as RenderCallback,
    };
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    guardFrames([{ ref }]);
    ref.current(stateOf(scene), 0);

    expect(scene.visible).toBe(false);
    expect(heard).toHaveBeenCalledWith(error);
    stop();
  });

  it("keeps the latest callback useFrame writes and the ref's identity", () => {
    const calls: string[] = [];
    const ref = { current: (() => calls.push("first")) as RenderCallback };

    guardFrames([{ ref }]);
    ref.current = () => calls.push("second");
    guardFrames([{ ref }]);
    ref.current(stateOf(new Scene()), 0);

    expect(calls).toEqual(["second"]);
  });

  it("tells the console of one scene's failure once", () => {
    const scene = new Scene();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ref = {
      current: (() => {
        throw new Error("again");
      }) as RenderCallback,
    };

    guardFrames([{ ref }]);
    ref.current(stateOf(scene), 0);
    ref.current(stateOf(scene), 0);

    expect(log).toHaveBeenCalledTimes(1);
  });
});

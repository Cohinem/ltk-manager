// @vitest-environment happy-dom

import type { TransformControlsProps } from "@react-three/drei";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { Group } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ForceGizmo } from "../ForceGizmo";
import { forceOf, forceSystem, vector } from "./forceFixture";

const capture = vi.hoisted(() => ({
  frame: () => {},
  props: {} as TransformControlsProps,
  controls: { enabled: true },
  setPlaying: vi.fn(),
  driver: {
    phase: 0.5,
    elapsed: 0.5,
    time: 0.5,
    origin: [0, 0, 0],
    orientation: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
    swap: vi.fn(),
    seek: vi.fn(),
  },
}));
vi.mock("@react-three/drei", () => ({
  TransformControls: (props: TransformControlsProps) => {
    capture.props = props;
    return null;
  },
}));
vi.mock("@react-three/fiber", () => ({
  useFrame: (frame: () => void) => {
    capture.frame = frame;
  },
  useThree: (select: (state: { controls: typeof capture.controls }) => unknown) =>
    select({ controls: capture.controls }),
}));
vi.mock("@/modules/viewport", () => ({
  AXIS_SIGN: [-1, 1, 1],
  useSceneColors: () => ({ gizmo: "white" }),
}));
vi.mock("../../playback/state/run", () => ({
  useVfxRun: () => ({ driver: capture.driver, playing: true, setPlaying: capture.setPlaying }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  capture.controls.enabled = true;
});
afterEach(cleanup);

function mount() {
  const commit = vi.fn().mockResolvedValue(true);
  const system = forceSystem();
  const force = forceOf("acceleration", { acceleration: vector(3, 4, 5) });
  const view = render(
    <ForceGizmo
      system={system}
      emitter={system.emitters[0]}
      force={force}
      handle="acceleration"
      edit={{ commit, refused: new Map() }}
    />,
  );
  act(() => capture.frame());

  return { ...view, commit, system };
}

function move() {
  act(() => capture.props.onMouseDown?.());
  const object = capture.props.object as Group;
  object.position.x = -12;
  act(() => capture.props.onObjectChange?.());
}

describe("force drag transactions", () => {
  it("previews a drag and saves once on release", async () => {
    const { commit } = mount();
    let resolve!: (value: boolean) => void;
    commit.mockReturnValue(
      new Promise<boolean>((done) => {
        resolve = done;
      }),
    );
    move();
    expect(commit).not.toHaveBeenCalled();
    act(() => {
      capture.props.onMouseUp?.();
      capture.props.onMouseUp?.();
    });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(capture.props.enabled).toBe(false);
    expect(commit).toHaveBeenCalledWith(expect.anything(), {
      ok: true,
      leaf: { type: "vector", values: [12, 4, 5] },
    });

    await act(async () => resolve(true));
    expect(capture.setPlaying).toHaveBeenLastCalledWith(true);
  });

  it("cancels with Escape without writing a declaration", () => {
    const { commit, system } = mount();
    move();
    fireEvent.keyDown(window, { key: "Escape" });
    act(() => capture.props.onMouseUp?.());
    expect(commit).not.toHaveBeenCalled();
    expect(capture.driver.swap).toHaveBeenLastCalledWith(system);
    expect(capture.controls.enabled).toBe(true);
  });

  it("restores the source and playback when a save is refused", async () => {
    const { commit, system } = mount();
    commit.mockResolvedValue(false);
    move();
    await act(async () => capture.props.onMouseUp?.());
    expect(capture.driver.swap).toHaveBeenLastCalledWith(system);
    expect(capture.setPlaying).toHaveBeenLastCalledWith(true);
  });

  it("restores playback when the selected force disappears during a drag", () => {
    const { unmount, commit, system } = mount();
    move();
    unmount();
    expect(commit).not.toHaveBeenCalled();
    expect(capture.driver.swap).toHaveBeenLastCalledWith(system);
    expect(capture.setPlaying).toHaveBeenLastCalledWith(true);
  });
});

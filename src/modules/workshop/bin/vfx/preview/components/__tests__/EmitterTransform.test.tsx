// @vitest-environment happy-dom

import type { TransformControlsProps } from "@react-three/drei";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { Group } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BinRow } from "@/lib/tauri";

import { readVfxSystem } from "../../../engine/parsing/readVfxSystem";
import { emitterOf } from "../../../engine/simulation/__tests__/emitterFixture";
import { EmitterTransform } from "../EmitterTransform";

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
vi.mock("../../../playback/state/run", () => ({
  useVfxRun: () => ({ driver: capture.driver, playing: true, setPlaying: capture.setPlaying }),
}));

const emitter = emitterOf(0);
const system = {
  ...readVfxSystem({
    materials: [],
    entry: "0x1",
    name: null,
    classHash: "0x1",
    class: "VfxSystemDefinitionData",
    root: {
      type: "struct",
      classHash: "0x1",
      class: "VfxSystemDefinitionData",
      object: null,
      fields: [],
    },
  }),
  emitters: [emitter],
};
const row = {
  entry: "0x1",
  path: "abc[0].b36cff34",
  value: { type: "vector", values: [0, 0, 0] },
} as BinRow;

beforeEach(() => {
  vi.clearAllMocks();
  capture.controls.enabled = true;
});
afterEach(cleanup);

function mount() {
  const commit = vi.fn();
  const view = render(
    <EmitterTransform
      system={system}
      emitter={emitter}
      row={row}
      mode="translate"
      edit={{ commit, refused: new Map() }}
    />,
  );
  act(() => capture.frame());

  return { ...view, commit };
}

function move() {
  act(() => capture.props.onMouseDown?.());
  const object = capture.props.object as Group;
  object.position.x = -12;
  act(() => capture.props.onObjectChange?.());
}

describe("emitter gizmo transactions", () => {
  it("keeps the preview while saving and ignores a duplicate release", async () => {
    const { commit } = mount();
    let resolve!: (saved: boolean) => void;
    commit.mockReturnValue(
      new Promise<boolean>((done) => {
        resolve = done;
      }),
    );
    move();
    act(() => {
      capture.props.onMouseUp?.();
      capture.props.onMouseUp?.();
    });

    expect(commit).toHaveBeenCalledTimes(1);
    expect(capture.setPlaying).toHaveBeenLastCalledWith(false);
    expect(capture.props.enabled).toBe(false);

    await act(async () => {
      resolve(true);
    });
    expect(capture.setPlaying).toHaveBeenLastCalledWith(true);
    expect(capture.driver.swap.mock.lastCall?.[0].emitters[0].translationOverride).toEqual([
      12, 0, 0,
    ]);
  });

  it("previews without saving and commits the engine-space vector once on release", async () => {
    const { commit } = mount();
    move();
    expect(commit).not.toHaveBeenCalled();
    expect(capture.setPlaying).toHaveBeenCalledWith(false);
    expect(capture.driver.swap.mock.lastCall?.[0].emitters[0].translationOverride).toEqual([
      12, 0, 0,
    ]);

    await act(async () => {
      capture.props.onMouseUp?.();
    });
    expect(commit).toHaveBeenCalledExactlyOnceWith(row, {
      ok: true,
      leaf: { type: "vector", values: [12, 0, 0] },
    });
    expect(capture.setPlaying).toHaveBeenLastCalledWith(true);
    expect(capture.driver.swap.mock.lastCall?.[0].emitters[0].translationOverride).toEqual([
      12, 0, 0,
    ]);
  });

  it("restores the original definition when the declaration is refused", async () => {
    const { commit } = mount();
    commit.mockResolvedValue(false);
    move();
    await act(async () => {
      capture.props.onMouseUp?.();
    });

    expect(capture.driver.swap).toHaveBeenLastCalledWith(system);
    expect(capture.setPlaying).toHaveBeenLastCalledWith(true);
  });

  it("cancels with Escape and ignores the subsequent mouse release", () => {
    const { commit } = mount();
    move();
    fireEvent.keyDown(window, { key: "Escape" });
    act(() => capture.props.onMouseUp?.());

    expect(commit).not.toHaveBeenCalled();
    expect(capture.driver.swap).toHaveBeenLastCalledWith(system);
    expect(capture.controls.enabled).toBe(true);
  });

  it("restores the run and camera when selection unmounts during a drag", () => {
    const { unmount, commit } = mount();
    move();
    capture.controls.enabled = false;
    unmount();

    expect(commit).not.toHaveBeenCalled();
    expect(capture.driver.swap).toHaveBeenLastCalledWith(system);
    expect(capture.controls.enabled).toBe(true);
    expect(capture.setPlaying).toHaveBeenLastCalledWith(true);
  });
});

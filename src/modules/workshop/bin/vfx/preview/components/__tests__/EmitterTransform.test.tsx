// @vitest-environment happy-dom

import type { TransformControlsProps } from "@react-three/drei";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { Group } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BinRow } from "@/lib/tauri";

import type { EmitterModel } from "../../../engine/model/model";
import { readVfxSystem } from "../../../engine/parsing/readVfxSystem";
import { emitterOf, flat } from "../../../engine/simulation/__tests__/emitterFixture";
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

const UNTURNED = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** The system facing `+X`: a quarter turn that takes `+X` to `-Z` and `+Z` to `+X`. */
const QUARTER = [0, 0, 1, 0, 1, 0, -1, 0, 0];

beforeEach(() => {
  vi.clearAllMocks();
  capture.controls.enabled = true;
  capture.driver.orientation.set(UNTURNED);
});
afterEach(cleanup);

/** The gizmo over the fixture's emitter, or over that emitter with `over` written on it. */
function mount(over?: Partial<EmitterModel>) {
  const commit = vi.fn();
  const held = over === undefined ? emitter : { ...emitter, ...over };
  const view = render(
    <EmitterTransform
      system={over === undefined ? system : { ...system, emitters: [held] }}
      emitter={held}
      row={row}
      mode="translate"
      edit={{ commit, refused: new Map() }}
    />,
  );
  act(() => capture.frame());

  return { ...view, commit };
}

/** The handle's place and the vector a drag of it to `x = -12` commits. */
async function dragged(over: Partial<EmitterModel>) {
  const { commit } = mount(over);
  const stood = (capture.props.object as Group).position.toArray();
  move();
  await act(async () => {
    capture.props.onMouseUp?.();
  });

  const values: number[] = commit.mock.lastCall?.[1].leaf.values ?? [];
  return { stood, values };
}

/** `actual` against `expected`, component by component. */
function expectPoint(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, axis) => expect(actual[axis]).toBeCloseTo(value, 4));
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

describe("the frame a translation is dragged in", () => {
  it("reads translationOverride back unturned and unscaled by the emitter's own override", async () => {
    const { stood, values } = await dragged({
      translationOverride: [4, 0, 0],
      rotationOverride: [0, 90, 0],
      scaleOverride: [3, 3, 3],
    });

    expectPoint(stood, [-4, 0, 0]);
    expectPoint(values, [12, 0, 0]);
  });

  it("turns translationOverride by the system's orientation, and reads a drag back through it", async () => {
    capture.driver.orientation.set(QUARTER);

    const { stood, values } = await dragged({ translationOverride: [0, 0, 4] });

    /* The quarter turn takes `+Z` to `+X`, which the viewport mirrors. */
    expectPoint(stood, [-4, 0, 0]);
    expectPoint(values, [0, 0, 12]);
  });

  it("leaves the system's orientation out where isLocalOrientation is off", async () => {
    capture.driver.orientation.set(QUARTER);

    const { stood, values } = await dragged({
      translationOverride: [4, 0, 0],
      localOrientation: false,
    });

    expectPoint(stood, [-4, 0, 0]);
    expectPoint(values, [12, 0, 0]);
  });

  it("stands the handle on EmitterPosition, turned by the emitter's frame, and keeps it out of the write", async () => {
    const { stood, values } = await dragged({
      translationOverride: [4, 0, 0],
      scaleOverride: [1, 2, 1],
      emitterPosition: flat(0, 5, 0),
    });

    expectPoint(stood, [-4, 10, 0]);
    expectPoint(values, [12, 0, 0]);
  });

  it("stands the handle past the transform's translation, inside the emitter's frame", async () => {
    const moved = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1];
    const held = { ...emitter, scaleOverride: [2, 1, 1] as const };
    const commit = vi.fn();
    render(
      <EmitterTransform
        system={{ ...system, emitters: [held], transform: moved }}
        emitter={held}
        row={row}
        mode="translate"
        edit={{ commit, refused: new Map() }}
      />,
    );
    act(() => capture.frame());

    expectPoint((capture.props.object as Group).position.toArray(), [-10, 0, 0]);

    move();
    await act(async () => {
      capture.props.onMouseUp?.();
    });
    expectPoint(commit.mock.lastCall?.[1].leaf.values, [2, 0, 0]);
  });
});

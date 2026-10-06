// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import type { SystemModel } from "../../../engine/model/model";
import { emitterOf, flat } from "../../../engine/simulation/__tests__/emitterFixture";
import { setHandlePreview, useHandlePreview } from "../handlePreview";

afterEach(() => {
  cleanup();
  setHandlePreview(null);
});

it("gives a dragged emitter to its own system only, and none after the drag is cleared", () => {
  const emitter = emitterOf(0, { rate: flat(5) });
  const dragged = { ...emitter, shape: { kind: "sphere", radius: 9, volume: false } as const };
  const system = { emitters: [emitter] } as unknown as SystemModel;
  const reread = { emitters: [emitter] } as unknown as SystemModel;

  const own = renderHook(() => useHandlePreview(system));
  const other = renderHook(() => useHandlePreview(reread));
  expect(own.result.current).toBeNull();

  act(() => setHandlePreview({ system, emitter: dragged }));
  expect(own.result.current).toBe(dragged);
  expect(other.result.current).toBeNull();

  act(() => setHandlePreview(null));
  expect(own.result.current).toBeNull();
});

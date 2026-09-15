// @vitest-environment happy-dom

import { act, cleanup, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { ContentVisibilityContext } from "@/hooks";

import { readVfxSystem } from "../../../engine/parsing/readVfxSystem";
import { useVfxRun, VfxRunProvider, type VfxRun } from "../run";

const system = readVfxSystem({
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
});
vi.mock("../../../hooks/useVfxSystem", () => ({
  useVfxSystem: () => ({ system, error: null, pending: false }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("pauses a hidden document's simulation and resumes without catching up hidden time", () => {
  const queued = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    queued.set(++id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (key: number) => queued.delete(key));
  let run: VfxRun;
  function Capture() {
    const current = useVfxRun();
    useEffect(() => {
      run = current;
    }, [current]);
    return null;
  }
  function tick(time: number) {
    act(() => {
      const callbacks = [...queued.values()];
      queued.clear();
      for (const callback of callbacks) callback(time);
    });
  }
  const view = (visible: boolean) => (
    <ContentVisibilityContext value={visible}>
      <VfxRunProvider document={934} entry="0x1">
        <Capture />
      </VfxRunProvider>
    </ContentVisibilityContext>
  );
  const { rerender } = render(view(true));
  tick(0);
  tick(50);
  expect(run!.driver.phase).toBeCloseTo(0.05);
  const driver = run!.driver;
  rerender(view(false));
  expect(queued.size).toBe(0);
  tick(10000);
  expect(driver.phase).toBeCloseTo(0.05);
  rerender(view(true));
  tick(10000);
  tick(10050);
  expect(run!.driver).toBe(driver);
  expect(driver.phase).toBeCloseTo(0.1);
  expect(run!.playing).toBe(true);
});

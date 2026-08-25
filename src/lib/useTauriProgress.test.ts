// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { type Mock, vi } from "vitest";

import { mockListen } from "@/test/mocks/tauri";

import { useTauriProgress } from "./useTauriProgress";

interface TestProgress {
  stage: string;
  value: number;
}

beforeEach(() => {
  vi.useFakeTimers();
  mockListen.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

function setupMockListen() {
  const unlisten = vi.fn();
  mockListen.mockReturnValue(Promise.resolve(unlisten));
  return unlisten;
}

function getListenCallback(): (event: { payload: TestProgress }) => void {
  const calls = (mockListen as Mock).mock.calls;
  return calls[calls.length - 1][1];
}

it("starts with null progress", async () => {
  setupMockListen();

  const { result } = renderHook(() => useTauriProgress<TestProgress>("progress-event"));
  await act(() => Promise.resolve());

  expect(result.current.progress).toBeNull();
});

it("updates progress when an event is received", async () => {
  setupMockListen();

  const { result } = renderHook(() => useTauriProgress<TestProgress>("progress-event"));
  await act(() => Promise.resolve());

  const listenCb = getListenCallback();
  act(() => listenCb({ payload: { stage: "downloading", value: 50 } }));

  expect(result.current.progress).toEqual({ stage: "downloading", value: 50 });
});

it("auto-clears after a terminal stage (default: complete)", async () => {
  setupMockListen();

  const { result } = renderHook(() => useTauriProgress<TestProgress>("progress-event"));
  await act(() => Promise.resolve());

  const listenCb = getListenCallback();
  act(() => listenCb({ payload: { stage: "complete", value: 100 } }));

  expect(result.current.progress).toEqual({ stage: "complete", value: 100 });

  act(() => vi.advanceTimersByTime(1000));

  expect(result.current.progress).toBeNull();
});

it("auto-clears after a terminal stage (default: error)", async () => {
  setupMockListen();

  const { result } = renderHook(() => useTauriProgress<TestProgress>("progress-event"));
  await act(() => Promise.resolve());

  const listenCb = getListenCallback();
  act(() => listenCb({ payload: { stage: "error", value: 0 } }));

  act(() => vi.advanceTimersByTime(1000));

  expect(result.current.progress).toBeNull();
});

it("does not auto-clear for non-terminal stages", async () => {
  setupMockListen();

  const { result } = renderHook(() => useTauriProgress<TestProgress>("progress-event"));
  await act(() => Promise.resolve());

  const listenCb = getListenCallback();
  act(() => listenCb({ payload: { stage: "downloading", value: 50 } }));

  act(() => vi.advanceTimersByTime(5000));

  expect(result.current.progress).toEqual({ stage: "downloading", value: 50 });
});

it("respects custom terminalStages", async () => {
  setupMockListen();
  const terminalStages = ["done"];

  const { result } = renderHook(() =>
    useTauriProgress<TestProgress>("progress-event", { terminalStages }),
  );
  await act(() => Promise.resolve());

  const listenCb = getListenCallback();

  act(() => listenCb({ payload: { stage: "complete", value: 100 } }));
  act(() => vi.advanceTimersByTime(2000));
  expect(result.current.progress).toEqual({ stage: "complete", value: 100 });

  act(() => listenCb({ payload: { stage: "done", value: 100 } }));
  expect(result.current.progress).toEqual({ stage: "done", value: 100 });
  act(() => vi.advanceTimersByTime(1000));
  expect(result.current.progress).toBeNull();
});

it("respects custom clearDelay", async () => {
  setupMockListen();

  const { result } = renderHook(() =>
    useTauriProgress<TestProgress>("progress-event", { clearDelay: 3000 }),
  );
  await act(() => Promise.resolve());

  const listenCb = getListenCallback();
  act(() => listenCb({ payload: { stage: "complete", value: 100 } }));

  act(() => vi.advanceTimersByTime(1000));
  expect(result.current.progress).not.toBeNull();

  act(() => vi.advanceTimersByTime(2000));
  expect(result.current.progress).toBeNull();
});

it("resets the clear timer when a new terminal event arrives", async () => {
  setupMockListen();

  const { result } = renderHook(() => useTauriProgress<TestProgress>("progress-event"));
  await act(() => Promise.resolve());

  const listenCb = getListenCallback();
  act(() => listenCb({ payload: { stage: "complete", value: 100 } }));

  act(() => vi.advanceTimersByTime(500));
  expect(result.current.progress).not.toBeNull();

  act(() => listenCb({ payload: { stage: "error", value: 0 } }));

  act(() => vi.advanceTimersByTime(500));
  expect(result.current.progress).toEqual({ stage: "error", value: 0 });

  act(() => vi.advanceTimersByTime(500));
  expect(result.current.progress).toBeNull();
});

it("clear() manually resets progress to null", async () => {
  setupMockListen();

  const { result } = renderHook(() => useTauriProgress<TestProgress>("progress-event"));
  await act(() => Promise.resolve());

  const listenCb = getListenCallback();
  act(() => listenCb({ payload: { stage: "downloading", value: 50 } }));
  expect(result.current.progress).not.toBeNull();

  act(() => result.current.clear());
  expect(result.current.progress).toBeNull();
});

it("unsubscribes and clears timers on unmount", async () => {
  const unlisten = setupMockListen();

  const { unmount } = renderHook(() => useTauriProgress<TestProgress>("progress-event"));
  await act(() => Promise.resolve());

  const listenCb = getListenCallback();
  act(() => listenCb({ payload: { stage: "complete", value: 100 } }));

  unmount();
  await act(() => Promise.resolve());

  expect(unlisten).toHaveBeenCalled();

  // Timer should have been cleared — no errors from setting state after unmount
  act(() => vi.advanceTimersByTime(2000));
});

it("subscribes to the correct event name", async () => {
  setupMockListen();

  renderHook(() => useTauriProgress<TestProgress>("my-custom-event"));
  await act(() => Promise.resolve());

  expect(mockListen).toHaveBeenCalledWith("my-custom-event", expect.any(Function));
});

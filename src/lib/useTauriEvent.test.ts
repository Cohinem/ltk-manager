// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { type Mock, vi } from "vitest";

import { mockListen } from "@/test/mocks/tauri";

import { useTauriEvent } from "./useTauriEvent";

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

function getListenCallback(): (event: { payload: unknown }) => void {
  return (mockListen as Mock).mock.calls[0][1];
}

it("subscribes to the given event name", async () => {
  const unlisten = setupMockListen();
  const callback = vi.fn();

  renderHook(() => useTauriEvent("my-event", callback));
  await act(() => Promise.resolve());

  expect(mockListen).toHaveBeenCalledWith("my-event", expect.any(Function));
  expect(unlisten).not.toHaveBeenCalled();
});

it("forwards event payloads to the callback", async () => {
  setupMockListen();
  const callback = vi.fn();

  renderHook(() => useTauriEvent<string>("my-event", callback));
  await act(() => Promise.resolve());

  const listenCb = getListenCallback();
  act(() => listenCb({ payload: "hello" }));

  expect(callback).toHaveBeenCalledWith("hello");
});

it("uses the latest callback without re-subscribing", async () => {
  setupMockListen();
  const callback1 = vi.fn();
  const callback2 = vi.fn();

  const { rerender } = renderHook(({ cb }) => useTauriEvent("my-event", cb), {
    initialProps: { cb: callback1 },
  });
  await act(() => Promise.resolve());

  rerender({ cb: callback2 });

  const listenCb = getListenCallback();
  act(() => listenCb({ payload: "data" }));

  expect(callback1).not.toHaveBeenCalled();
  expect(callback2).toHaveBeenCalledWith("data");
  expect(mockListen).toHaveBeenCalledTimes(1);
});

it("does not subscribe when eventName is null", () => {
  const callback = vi.fn();

  renderHook(() => useTauriEvent("my-event" as string | null, callback));

  // Reset to check null case
  mockListen.mockClear();

  renderHook(() => useTauriEvent(null, callback));

  expect(mockListen).not.toHaveBeenCalled();
});

it("unsubscribes on unmount", async () => {
  const unlisten = setupMockListen();
  const callback = vi.fn();

  const { unmount } = renderHook(() => useTauriEvent("my-event", callback));
  await act(() => Promise.resolve());

  unmount();
  await act(() => Promise.resolve());

  expect(unlisten).toHaveBeenCalled();
});

it("re-subscribes when eventName changes", async () => {
  const unlisten1 = vi.fn();
  const unlisten2 = vi.fn();
  mockListen
    .mockReturnValueOnce(Promise.resolve(unlisten1))
    .mockReturnValueOnce(Promise.resolve(unlisten2));

  const callback = vi.fn();

  const { rerender } = renderHook(({ name }) => useTauriEvent(name, callback), {
    initialProps: { name: "event-a" },
  });
  await act(() => Promise.resolve());

  rerender({ name: "event-b" });
  await act(() => Promise.resolve());

  expect(unlisten1).toHaveBeenCalled();
  expect(mockListen).toHaveBeenCalledWith("event-b", expect.any(Function));
});

it("unlistens immediately if unmounted before listen resolves", async () => {
  const unlisten = vi.fn();
  let resolvePromise: (fn: Mock) => void;
  mockListen.mockReturnValue(
    new Promise<Mock>((resolve) => {
      resolvePromise = resolve;
    }),
  );

  const { unmount } = renderHook(() => useTauriEvent("my-event", vi.fn()));
  unmount();

  await act(async () => {
    resolvePromise!(unlisten);
    await Promise.resolve();
  });

  expect(unlisten).toHaveBeenCalled();
});

// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { revealInList } from "../revealInList";

/** A view 100 pixels tall, and an element whose top a test moves. */
function staged() {
  const view = document.createElement("div");
  const element = document.createElement("button");
  view.append(element);
  document.body.append(view);

  const at = { top: 500 };
  vi.spyOn(view, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 0, 200, 100));
  vi.spyOn(element, "getBoundingClientRect").mockImplementation(
    () => new DOMRect(0, at.top, 200, 24),
  );

  return { view, element, at };
}

/** Run `count` animation frames. */
async function frames(count: number) {
  await vi.advanceTimersByTimeAsync(count * 16);
}

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("revealInList", () => {
  it("focuses an element already in view without scrolling the list", async () => {
    const { view, element, at } = staged();
    at.top = 40;
    const scrollTo = vi.fn();
    const onSettled = vi.fn();

    revealInList({ scroller: () => view, find: () => element, scrollTo, onSettled });
    await frames(2);

    expect(scrollTo).not.toHaveBeenCalled();
    expect(element).toHaveFocus();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("jumps until the element is drawn inside the view, then focuses it", async () => {
    const { view, element, at } = staged();
    let drawn = false;
    const scrollTo = vi.fn(() => {
      if (scrollTo.mock.calls.length < 3) return;
      drawn = true;
      at.top = 40;
    });
    const onSettled = vi.fn();

    revealInList({
      scroller: () => view,
      find: () => (drawn ? element : null),
      scrollTo,
      onSettled,
    });
    await frames(2);

    expect(onSettled).not.toHaveBeenCalled();

    await frames(4);

    expect(scrollTo).toHaveBeenCalledTimes(3);
    expect(element).toHaveFocus();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("treats an element under the pinned band as out of view", async () => {
    const { view, element, at } = staged();
    at.top = 10;
    const scrollTo = vi.fn(() => {
      at.top = 60;
    });

    revealInList({ scroller: () => view, find: () => element, scrollTo, inset: () => 48 });
    await frames(3);

    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(element).toHaveFocus();
  });

  it("waits for a view of no height, which is hidden or not laid out", async () => {
    const { view, element, at } = staged();
    at.top = 0;
    const size = { height: 0 };
    vi.spyOn(view, "getBoundingClientRect").mockImplementation(
      () => new DOMRect(0, 0, 200, size.height),
    );
    const onSettled = vi.fn();

    revealInList({ scroller: () => view, find: () => element, scrollTo: () => {}, onSettled });
    await frames(3);

    expect(onSettled).not.toHaveBeenCalled();

    size.height = 100;
    await frames(2);

    expect(element).toHaveFocus();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("settles after its frames run out, and stops when cancelled", async () => {
    const { view } = staged();
    const scrollTo = vi.fn();
    const onSettled = vi.fn();

    revealInList({ scroller: () => view, find: () => null, scrollTo, onSettled });
    await frames(60);

    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledTimes(30);

    const cancelled = vi.fn();
    const cancel = revealInList({
      scroller: () => view,
      find: () => null,
      scrollTo: cancelled,
      onSettled,
    });
    cancel();
    await frames(5);

    expect(cancelled).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });
});

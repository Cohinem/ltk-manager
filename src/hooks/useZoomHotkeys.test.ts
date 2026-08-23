import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useDisplayStore } from "@/stores";

import { useZoomHotkeys } from "./useZoomHotkeys";

/**
 * The bindings are written against `event.code`, which is what the library
 * matches on by default, so every case sends the code the physical key reports
 * rather than the character it produces.
 */
function press(code: string, key: string, target: EventTarget = document) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, code, ctrlKey: true, bubbles: true }));
    target.dispatchEvent(new KeyboardEvent("keyup", { key, code, ctrlKey: true, bubbles: true }));
  });
}

const zoom = () => useDisplayStore.getState().zoomLevel;

/* Through `act` so the hook re-renders and its step reads the new level. A bare
   setState leaves it closed over the one before. */
function setZoom(zoomLevel: ReturnType<typeof zoom>) {
  act(() => {
    useDisplayStore.setState({ zoomLevel });
  });
}

describe("useZoomHotkeys", () => {
  beforeEach(() => {
    useDisplayStore.setState({ zoomLevel: 100 });
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("steps up one level on ctrl and the equals key", () => {
    renderHook(() => useZoomHotkeys());
    press("Equal", "=");
    expect(zoom()).toBe(110);
  });

  it("steps down one level on ctrl and the minus key", () => {
    renderHook(() => useZoomHotkeys());
    press("Minus", "-");
    expect(zoom()).toBe(90);
  });

  it("returns to 100% on ctrl and zero", () => {
    setZoom(130);
    renderHook(() => useZoomHotkeys());
    press("Digit0", "0");
    expect(zoom()).toBe(100);
  });

  it("reaches the same steps from the numpad", () => {
    renderHook(() => useZoomHotkeys());
    press("NumpadAdd", "+");
    expect(zoom()).toBe(110);

    press("NumpadSubtract", "-");
    expect(zoom()).toBe(100);

    setZoom(70);
    press("Numpad0", "0");
    expect(zoom()).toBe(100);
  });

  it("clamps at the ends rather than wrapping", () => {
    setZoom(130);
    renderHook(() => useZoomHotkeys());
    press("Equal", "=");
    expect(zoom()).toBe(130);

    setZoom(70);
    press("Minus", "-");
    expect(zoom()).toBe(70);
  });

  it("still zooms while a field has focus", () => {
    renderHook(() => useZoomHotkeys());
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    press("Equal", "=", input);
    expect(zoom()).toBe(110);
  });
});

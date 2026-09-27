// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { ASSET_DROP_EVENT, beginAssetDrag } from "../assetDrag";

function press(x: number, y: number) {
  return { button: 0, clientX: x, clientY: y } as Parameters<typeof beginAssetDrag>[0];
}

describe("a content drag", () => {
  it("sends the path to the element under a release past the drag distance", () => {
    const target = document.createElement("div");
    document.body.append(target);
    const dropped = vi.fn();
    target.addEventListener(ASSET_DROP_EVENT, (event) => dropped((event as CustomEvent).detail));
    document.elementFromPoint = () => target;

    beginAssetDrag(press(0, 0), "assets/fx/glow.tex");
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 20, clientY: 0 }));
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: 20, clientY: 0 }));

    expect(dropped).toHaveBeenCalledWith({ path: "assets/fx/glow.tex", x: 20, y: 0 });
  });

  it("drops nothing for a press that never travels", () => {
    const target = document.createElement("div");
    const dropped = vi.fn();
    target.addEventListener(ASSET_DROP_EVENT, dropped);
    document.elementFromPoint = () => target;

    beginAssetDrag(press(0, 0), "assets/fx/glow.tex");
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: 1, clientY: 0 }));

    expect(dropped).not.toHaveBeenCalled();
  });
});

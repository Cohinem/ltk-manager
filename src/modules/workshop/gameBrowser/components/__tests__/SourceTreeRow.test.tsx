// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { createGuideStore, GuideStoreContext } from "../../../shared/state/treeGuides";
import { chunkAsset } from "../../state/wadSource";
import type { SourceDirNode, SourceFileNode } from "../../utils/sourceIndex";
import { type SourceTreeArt, SourceTreeRow } from "../SourceTreeRow";

const TEXTURE: SourceFileNode = {
  type: "file",
  id: "00aa00aa00aa00aa",
  name: "ahri_base_tx_cm.tex",
  entry: {
    pathHash: "00aa00aa00aa00aa",
    path: "assets/characters/ahri/skins/base/ahri_base_tx_cm.tex",
    sizeBytes: 2048,
    wad: "Champions/Ahri.wad.client",
  },
};

const ANIMATION: SourceFileNode = {
  type: "file",
  id: "00bb00bb00bb00bb",
  name: "ahri_idle.anm",
  entry: {
    pathHash: "00bb00bb00bb00bb",
    path: "assets/characters/ahri/animations/ahri_idle.anm",
    sizeBytes: 512,
    wad: "Champions/Ahri.wad.client",
  },
};

const SKINS: SourceDirNode = {
  type: "dir",
  id: "assets/characters/ahri/skins",
  path: "assets/characters/ahri/skins",
  name: "skins",
  unknown: false,
  fileCount: 3,
  children: [],
};

function artOf(shape: SourceTreeArt["shape"]): SourceTreeArt {
  return {
    box: 44,
    slotWidth: shape === "square" ? 44 : 88,
    requestWidth: shape === "square" ? 64 : 96,
    shape,
    assetOf: (item) =>
      item.kind === "file" ? chunkAsset("game", item.entry.wad, item.entry.pathHash) : null,
  };
}

function mount(
  node: SourceFileNode | SourceDirNode,
  art: SourceTreeArt | null,
  guides: readonly string[] = [],
) {
  return render(
    <SourceTreeRow
      node={node}
      depth={guides.length}
      guides={guides}
      isExpanded={false}
      isSelected={false}
      onToggle={() => {}}
      onSelect={() => {}}
      onFocusRow={() => {}}
      height={48}
      rowIndex={0}
      tabIndex={0}
      art={art}
    />,
  );
}

afterEach(cleanup);

describe("SourceTreeRow", () => {
  it("draws the kind glyph and no image without art", () => {
    const { container } = mount(TEXTURE, null);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("ahri_base_tx_cm.tex")).toBeInTheDocument();
  });

  it("draws a texture's thumbnail at the width the tree asks for", () => {
    const { container } = mount(TEXTURE, artOf("square"));

    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    expect(image!.getAttribute("src")).toContain("w=64");
  });

  it("draws a kind that has no viewer as its glyph, in the same slot", () => {
    const { container } = mount(ANIMATION, artOf("square"));

    expect(container.querySelector("img")).toBeNull();
    const slot = container.querySelector<HTMLElement>(
      "[data-ui='SourceTreeRow:file'] > span > span",
    );
    expect(slot?.style.width).toBe("44px");
  });

  it("widens the plate to a wide image's ratio once it lands", () => {
    const { container } = mount(TEXTURE, artOf("original"));

    const image = container.querySelector("img")!;
    const plate = image.parentElement!;
    expect(plate.style.width).toBe("44px");

    Object.defineProperty(image, "naturalWidth", { value: 512 });
    Object.defineProperty(image, "naturalHeight", { value: 256 });
    fireEvent.load(image);

    expect(plate.style.width).toBe("88px");
  });

  it("accents the guide of the block the reader stands in and lifts the hovered one", () => {
    const store = createGuideStore();
    store.set({ active: "assets/characters/ahri", hover: "assets" });
    const { container } = render(
      <GuideStoreContext value={store}>
        <SourceTreeRow
          node={TEXTURE}
          depth={2}
          guides={["assets", "assets/characters/ahri"]}
          isExpanded={false}
          isSelected={false}
          onToggle={() => {}}
          onSelect={() => {}}
          onFocusRow={() => {}}
          height={24}
          rowIndex={0}
          tabIndex={0}
        />
      </GuideStoreContext>,
    );

    const [outer, inner] = container.querySelectorAll("[aria-hidden='true'].border-l");
    expect(outer).toHaveClass("border-surface-600");
    expect(inner).toHaveClass("border-accent-500");
  });

  it("draws a directory's folder in the art's slot", () => {
    const { container } = mount(SKINS, artOf("original"));

    const slot = container.querySelector<HTMLElement>(
      "[data-ui='SourceTreeRow:dir'] > span > span",
    );
    expect(slot?.style.width).toBe("88px");
    expect(screen.getByText("skins")).toBeInTheDocument();
  });
});

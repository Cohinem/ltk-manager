// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AssetInfo, AssetRef } from "@/lib/tauri";
import { mockInvoke } from "@/test/mocks/tauri";
import { createTestQueryClient } from "@/test/utils";

import { CARD_WIDTH, SWATCH_WIDTH, TextureSwatch } from "../TextureSwatch";

const CHUNK: AssetRef = {
  kind: "gameChunk",
  wad: "Champions/Aatrox.wad.client",
  pathHash: "00cc",
};

const PATH = "assets/characters/aatrox/aatrox.tex";

const TEXTURE: AssetInfo = {
  kind: "texture",
  width: 256,
  height: 128,
  container: "TEX",
  format: "BC3",
  mipCount: 9,
  sizeBytes: 43_776n,
};

/** Past the hover delay a card opens after. */
const HOVER = { timeout: 2000 };

function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => createTestQueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderSwatch(asset: AssetRef = CHUNK, layerTitle?: string) {
  const onOpen = vi.fn();
  render(
    <Providers>
      <TextureSwatch
        asset={asset}
        path={PATH}
        fileKind="texture"
        layerTitle={layerTitle}
        onOpen={onOpen}
      />
    </Providers>,
  );
  return { onOpen, swatch: screen.getByRole("button", { name: "Texture preview" }) };
}

/** The `<img>` the line's grant puts in the swatch. */
async function findPixels(swatch: HTMLElement): Promise<HTMLImageElement> {
  return waitFor(() => {
    const img = swatch.querySelector("img");
    expect(img).not.toBeNull();
    return img as HTMLImageElement;
  });
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation((command: string) => {
    if (command === "read_asset_info") return Promise.resolve({ ok: true, value: TEXTURE });
    return Promise.resolve({ ok: false, error: { code: "UNKNOWN" } });
  });
});

describe("TextureSwatch", () => {
  it("asks for the row's mipmap, and opens the preview on a click", async () => {
    const user = userEvent.setup();
    const { onOpen, swatch } = renderSwatch();

    const img = await findPixels(swatch);
    expect(img.src).toMatch(new RegExp(`\\?w=${SWATCH_WIDTH}$`));

    await user.click(swatch);
    expect(onOpen).toHaveBeenCalledWith("default");
  });

  it("opens beside with Ctrl held", async () => {
    const user = userEvent.setup();
    const { onOpen, swatch } = renderSwatch();

    await user.keyboard("{Control>}");
    await user.click(swatch);
    await user.keyboard("{/Control}");

    expect(onOpen).toHaveBeenCalledWith("beside");
  });

  it("opens the card on hover with the texture at 256 and the facts its header declares", async () => {
    const user = userEvent.setup();
    const { swatch } = renderSwatch();

    await user.hover(swatch);

    const card = await screen.findByText(PATH, {}, HOVER);
    const facts = card.parentElement as HTMLElement;
    expect(await within(facts).findByText("256 × 128")).toBeInTheDocument();
    expect(facts).toHaveTextContent("TEX · BC3");
    expect(within(facts).getByText("Mips").nextElementSibling).toHaveTextContent("9");
    expect(facts).toHaveTextContent("Champions/Aatrox.wad.client");

    const pixels = await waitFor(() => {
      const img = within(facts).getByAltText(PATH) as HTMLImageElement;
      return img;
    });
    expect(pixels.src).toMatch(new RegExp(`\\?w=${CARD_WIDTH}$`));
  });

  it("names the layer rather than an archive on a layer copy's card", async () => {
    const user = userEvent.setup();
    const { swatch } = renderSwatch(
      { kind: "layer", project: "C:/mods/skin", layer: "base", path: PATH },
      "Base",
    );

    await user.hover(swatch);

    const card = await screen.findByText(PATH, {}, HOVER);
    const facts = card.parentElement as HTMLElement;
    expect((await within(facts).findByText("Layer")).nextElementSibling).toHaveTextContent("Base");
    expect(within(facts).queryByText("Archive")).toBeNull();
  });

  it("falls back to the kind badge where the pixels fail to arrive", async () => {
    const { swatch } = renderSwatch();
    const img = await findPixels(swatch);

    fireEvent.error(img);

    expect(screen.queryByRole("button", { name: "Texture preview" })).toBeNull();
    expect(screen.getByRole("img", { name: "Riot Texture" })).toBeInTheDocument();
  });
});

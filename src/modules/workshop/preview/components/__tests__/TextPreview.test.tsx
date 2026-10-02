// @vitest-environment happy-dom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AssetRef } from "@/lib/tauri";
import { renderWithProviders } from "@/test/utils";

import { TextPreview } from "../TextPreview";

const ASSET: AssetRef = {
  kind: "lcuChunk",
  wad: "rcp-be-lol-game-data/default-assets.wad",
  pathHash: "0123456789abcdef",
};

function serve(body: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body, { status: 200 })),
  );
}

/** The text the editor draws, line by line. */
function shownLines(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".cm-line")].map((line) => line.textContent ?? "");
}

describe("TextPreview", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens JSON indented, and Format off shows the bytes as they are", async () => {
    serve('{"id":1,"tags":["a"]}');
    const { container } = renderWithProviders(
      <TextPreview documentId="preview:1" asset={ASSET} name="1.json" />,
    );

    await waitFor(() => expect(shownLines(container)).toContain('  "id": 1,'));

    fireEvent.click(screen.getByRole("button", { name: "Format" }));

    await waitFor(() => expect(shownLines(container)).toEqual(['{"id":1,"tags":["a"]}']));
  });

  it("shows an HTML page as its source and runs none of it", async () => {
    serve("<html><script>window.__ran = true;</script></html>");
    const { container } = renderWithProviders(
      <TextPreview documentId="preview:2" asset={ASSET} name="index.html" />,
    );

    await waitFor(() =>
      expect(shownLines(container)).toEqual(["<html><script>window.__ran = true;</script></html>"]),
    );
    expect((window as { __ran?: boolean }).__ran).toBeUndefined();
    expect(screen.queryByRole("button", { name: "Format" })).not.toBeInTheDocument();
  });
});

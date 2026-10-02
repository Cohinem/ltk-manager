// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { useExpandedGameDirs, useGameBrowserStore, useToggleGameDir } from "../gameBrowser";
import { chunkAsset, WadSourceProvider } from "../wadSource";

function inClient({ children }: { children: ReactNode }) {
  return <WadSourceProvider source="lcu">{children}</WadSourceProvider>;
}

describe("a browser's source", () => {
  it("keeps the League client's tree apart from the game's", () => {
    useGameBrowserStore.setState({ expanded: new Set() });
    const client = renderHook(() => ({ open: useExpandedGameDirs(), toggle: useToggleGameDir() }), {
      wrapper: inClient,
    });

    act(() => client.result.current.toggle("plugins"));

    expect(client.result.current.open).toEqual(new Set(["plugins"]));
    expect(useGameBrowserStore.getState().expanded).toEqual(new Set());
  });

  it("reads the game outside every browser", () => {
    useGameBrowserStore.setState({ expanded: new Set(["assets"]) });
    const { result } = renderHook(() => useExpandedGameDirs());

    expect(result.current).toEqual(new Set(["assets"]));
  });

  it("names a chunk by the source it came from", () => {
    expect(chunkAsset("game", "UI.wad.client", "1")).toEqual({
      kind: "gameChunk",
      wad: "UI.wad.client",
      pathHash: "1",
    });
    expect(chunkAsset("lcu", "rcp-fe-lol-loot/assets.wad", "1")).toEqual({
      kind: "lcuChunk",
      wad: "rcp-fe-lol-loot/assets.wad",
      pathHash: "1",
    });
  });
});

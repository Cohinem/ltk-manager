import { createContext, type ReactNode, useContext } from "react";

import type { AssetRef, WadSource } from "@/lib/tauri";

const WadSourceContext = createContext<WadSource>("game");

/**
 * The set of archives the browser under it reads: the game's or the League client's.
 *
 * The game is the default, so a hook mounted outside every browser document reads the game.
 */
export function WadSourceProvider({
  source,
  children,
}: {
  source: WadSource;
  children: ReactNode;
}) {
  return <WadSourceContext.Provider value={source}>{children}</WadSourceContext.Provider>;
}

/** The archives the enclosing browser reads. */
export function useWadSource(): WadSource {
  return useContext(WadSourceContext);
}

/** The reference to one chunk of `source`, the route back to its bytes. */
export function chunkAsset(source: WadSource, wad: string, pathHash: string): AssetRef {
  if (source === "lcu") return { kind: "lcuChunk", wad, pathHash };
  return { kind: "gameChunk", wad, pathHash };
}

/** What the explorer under one source keeps its location and selection under. */
export function explorerIdOf(source: WadSource): string {
  return source;
}

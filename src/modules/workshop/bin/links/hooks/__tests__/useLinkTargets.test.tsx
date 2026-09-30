// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import type { AssetRef, BinRow, DeclaredObjects } from "@/lib/tauri";
import { commandNames } from "@/test/commandNames";
import { mockInvoke } from "@/test/mocks/tauri";
import { createTestQueryClient } from "@/test/utils";

import {
  DocumentSandboxProvider,
  RouteSandboxProvider,
} from "../../../../sandbox/state/SandboxContext";
import { nameHash } from "../../../shared/utils/binHash";
import {
  entryChunkPath,
  linkHashes,
  linkPaths,
  linkStringKeys,
  type RowGroup,
  useCheckLinkTargets,
} from "../useLinkTargets";

const ENTRY = "0x2a1f3c7d";

function row(path: string, value: BinRow["value"]): BinRow {
  return {
    entry: ENTRY,
    path,
    label: path,
    node: "property",
    name: path,
    unnamed: false,
    kind: "string",
    value,
    declared: null,
  };
}

const ROOTS: readonly BinRow[] = [
  row("0000000a", { type: "objectLink", hash: "0x00000002", name: null }),
  row("0000000b", { type: "hash", hash: "0x00000001", name: "weapon" }),
  row("0000000c", { type: "objectLink", hash: "0x00000002", name: null }),
  row("0000000d", { type: "string", value: "text" }),
  row("0000000e", { type: "wadChunkLink", hash: "00cc", path: "assets/aatrox.tex" }),
  row("0000000f", { type: "wadChunkLink", hash: "00dd", path: null }),
  row("00000010", { type: "string", value: "ASSETS/Characters/Aatrox/Aatrox.dds" }),
];

describe("linkHashes and linkPaths", () => {
  it("collect a group's link and hash targets, sorted and each once", () => {
    expect(linkHashes(ROOTS)).toEqual(
      [
        "0x00000001",
        "0x00000002",
        nameHash("text"),
        nameHash("ASSETS/Characters/Aatrox/Aatrox.dds"),
      ].sort(),
    );
    expect(linkPaths(ROOTS)).toEqual(
      ["assets/aatrox.tex", "assets/characters/aatrox/aatrox.dds"].sort(),
    );
  });
});

const KEY_ROWS: readonly BinRow[] = [
  row("00000011", { type: "string", value: "hud_Chat_Team" }),
  row("00000012", { type: "string", value: "hud_Chat_Party" }),
  row("00000013", { type: "string", value: "hud_Chat_Party" }),
  row("00000014", { type: "string", value: "Idle" }),
  row("00000015", { type: "string", value: "Justicar Aatrox" }),
  row("00000016", { type: "string", value: "ASSETS/Shared/some_texture.dds" }),
  row("00000017", { type: "hash", hash: "0x00000001", name: "hud_chat" }),
];

describe("linkStringKeys", () => {
  it("collects the strings shaped like a string-table key, sorted and each once", () => {
    expect(linkStringKeys(KEY_ROWS)).toEqual(["hud_Chat_Party", "hud_Chat_Team"]);
  });
});

const PROJECT_PATH = "C:/mods/skin";
const IN_PROJECT = { kind: "project", project: PROJECT_PATH } as const;

/** A tree drawn in the project's sandbox, as the workshop route provides it. */
function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => createTestQueryClient());
  return (
    <QueryClientProvider client={client}>
      <RouteSandboxProvider project={PROJECT_PATH}>{children}</RouteSandboxProvider>
    </QueryClientProvider>
  );
}

const DECLARED: DeclaredObjects = {
  index: { status: "ready" },
  objects: {
    "0x00000002": {
      path: "Characters/Aatrox",
      declarations: [
        {
          asset: { kind: "gameChunk", wad: "Champions/Aatrox.wad.client", pathHash: "00aa" },
          file: "data/characters/aatrox/aatrox.bin",
          classHash: "0x1",
          class: "CharacterRecord",
        },
      ],
    },
  },
};

const LOCATED: Record<string, AssetRef> = {
  "assets/aatrox.tex": {
    kind: "layer",
    project: PROJECT_PATH,
    layer: "base",
    path: "Aatrox.wad.client/assets/aatrox.tex",
  },
};

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation((command: string) => {
    if (command === commandNames.objects.declaredObjects)
      return Promise.resolve({ ok: true, value: DECLARED });
    if (command === commandNames.preview.locateFilesNear)
      return Promise.resolve({ ok: true, value: LOCATED });
    return Promise.resolve({ ok: false, error: { code: "UNKNOWN" } });
  });
});

describe("useCheckLinkTargets", () => {
  it("checks a group's targets in one call per kind, in the document's sandbox", async () => {
    const groups: RowGroup[] = [{ key: "", rows: ROOTS }];
    const { result } = renderHook(() => useCheckLinkTargets(7, groups), { wrapper: Providers });

    await waitFor(() => expect(result.current.pending).toBe(false));

    const declaredCalls = mockInvoke.mock.calls.filter(
      ([command]) => command === commandNames.objects.declaredObjects,
    );
    expect(declaredCalls).toEqual([
      [
        commandNames.objects.declaredObjects,
        { sandbox: IN_PROJECT, objectHashes: linkHashes(ROOTS), document: 7 },
      ],
    ]);
    const locatedCalls = mockInvoke.mock.calls.filter(
      ([command]) => command === commandNames.preview.locateFilesNear,
    );
    expect(locatedCalls).toEqual([
      [commandNames.preview.locateFilesNear, { sandbox: IN_PROJECT, paths: linkPaths(ROOTS) }],
    ]);

    expect(result.current.index).toEqual({ status: "ready" });
    expect(result.current.declared.get("0x00000002")?.path).toBe("Characters/Aatrox");
    expect(result.current.declared.has("0x00000001")).toBe(false);
    expect(result.current.located.get("assets/aatrox.tex")).toEqual(LOCATED["assets/aatrox.tex"]);
  });

  it("checks a game document's targets in the game sandbox", async () => {
    const groups: RowGroup[] = [{ key: "", rows: ROOTS }];
    const { result } = renderHook(() => useCheckLinkTargets(7, groups), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <Providers>
          <DocumentSandboxProvider sandbox={{ kind: "game" }}>{children}</DocumentSandboxProvider>
        </Providers>
      ),
    });

    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(mockInvoke).toHaveBeenCalledWith(commandNames.preview.locateFilesNear, {
      sandbox: { kind: "game" },
      paths: linkPaths(ROOTS),
    });
  });

  it("answers a group's string-table keys with their in-game lines, outside pending", async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === commandNames.game.lookupStringValues) {
        return Promise.resolve({ ok: true, value: { hud_Chat_Party: "Party" } });
      }
      return Promise.resolve({ ok: true, value: { index: { status: "ready" }, objects: {} } });
    });
    const groups: RowGroup[] = [{ key: "", rows: KEY_ROWS }];
    const { result } = renderHook(() => useCheckLinkTargets(7, groups), { wrapper: Providers });

    await waitFor(() => expect(result.current.strings.get("hud_Chat_Party")).toBe("Party"));
    expect(result.current.strings.has("hud_Chat_Team")).toBe(false);
    expect(mockInvoke).toHaveBeenCalledWith(commandNames.game.lookupStringValues, {
      keys: ["hud_Chat_Party", "hud_Chat_Team"],
    });
  });

  it("makes no call for a group holding no target", () => {
    const groups: RowGroup[] = [{ key: "", rows: [row("0000000d", { type: "float", value: 1 })] }];
    const { result } = renderHook(() => useCheckLinkTargets(7, groups), { wrapper: Providers });

    expect(result.current.pending).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe("entryChunkPath", () => {
  /* A layer entry is addressed from the layer root, and a `file` value is not. */
  it("drops the archive directory a layer entry is addressed under", () => {
    expect(entryChunkPath("Smolder.wad.client/assets/characters/smolder/tx_cm.tex")).toBe(
      "assets/characters/smolder/tx_cm.tex",
    );
  });

  it("keeps the author's own casing, which the caller folds", () => {
    expect(entryChunkPath("Smolder.WAD.client/ASSETS/Foo.tex")).toBe("ASSETS/Foo.tex");
  });

  it("is null for a file that sits outside an archive directory", () => {
    expect(entryChunkPath("README.md")).toBeNull();
    expect(entryChunkPath("meta/info.json")).toBeNull();
  });
});

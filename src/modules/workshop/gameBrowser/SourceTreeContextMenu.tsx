import { ArrowSquareOutIcon, CopyIcon, HashIcon, PathIcon, TabsIcon } from "@phosphor-icons/react";

import { ContextMenu } from "@/components";
import { useCopyToClipboard } from "@/hooks";

import { isPropertyBin, useOpenInRitobin, useRitobinIntegration } from "../preview";
import { ExtractMenuItems } from "./ExtractMenuItems";
import { fileKindFromPath } from "./fileKind";
import type { SourceFileNode, SourceTreeNode } from "./sourceIndex";
import type { ExtractHow } from "./useExtractActions";

interface SourceTreeContextMenuProps {
  /** The row the menu was opened on. Absent while it has never been opened. */
  node: SourceTreeNode | null;
  /** Opens a file row, the way a double click on it would. */
  onOpen?: (node: SourceFileNode) => void;
  /** Runs one of the extract routes against the row. Absent leaves them off. */
  onRun?: (node: SourceTreeNode, how: ExtractHow) => void;
}

/**
 * The source tree's one menu, aimed at whichever row opened it.
 *
 * A file row gets the whole menu. A directory in this tree is a segment of a
 * resolved chunk path rather than anything on disk, and folded chains mean its
 * own row does not even know the whole of it, so it gets the ways out alone.
 */
export function SourceTreeContextMenu({ node, onOpen, onRun }: SourceTreeContextMenuProps) {
  const copy = useCopyToClipboard();
  const ritobin = useRitobinIntegration();
  const openInRitobin = useOpenInRitobin();

  /* A directory row gets the ways out and nothing else. It is a segment of a
     resolved chunk path rather than anything on disk, so it has no name, no
     path and no hash of its own to copy. */
  if (node?.type === "dir") {
    if (!onRun) return null;
    return (
      <ContextMenu.Portal>
        <ContextMenu.Positioner>
          <ContextMenu.Popup className="w-60">
            <ExtractMenuItems onRun={(how) => onRun(node, how)} />
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    );
  }

  if (node?.type !== "file") return null;

  const path = node.entry.path;
  /* A chunk no hash table names has its hash for a name, and no extension to
     read a kind off. The preview pane offers it anyway, off the bytes. */
  const bin = isPropertyBin(fileKindFromPath(node.name)) && ritobin.data === true;

  return (
    <ContextMenu.Portal>
      <ContextMenu.Positioner>
        <ContextMenu.Popup className="w-60">
          {onOpen && (
            <ContextMenu.Item icon={<TabsIcon className="h-4 w-4" />} onClick={() => onOpen(node)}>
              Open
            </ContextMenu.Item>
          )}
          {bin && (
            <ContextMenu.Item
              icon={<ArrowSquareOutIcon className="h-4 w-4" />}
              onClick={() =>
                openInRitobin.mutate({
                  asset: {
                    kind: "gameChunk",
                    wad: node.entry.wad,
                    pathHash: node.entry.pathHash,
                  },
                  name: node.name,
                })
              }
            >
              Open in VS Code
            </ContextMenu.Item>
          )}
          {(onOpen || bin) && <ContextMenu.Separator />}
          {onRun && <ExtractMenuItems onRun={(how) => onRun(node, how)} />}
          {onRun && <ContextMenu.Separator />}
          <ContextMenu.Item
            icon={<CopyIcon className="h-4 w-4" />}
            onClick={() => void copy(node.name, "name")}
          >
            Copy Name
          </ContextMenu.Item>
          <ContextMenu.Item
            icon={<PathIcon className="h-4 w-4" />}
            disabled={path === null}
            onClick={() => path !== null && void copy(path, "chunk path")}
          >
            Copy Chunk Path
          </ContextMenu.Item>
          <ContextMenu.Item
            icon={<HashIcon className="h-4 w-4" />}
            onClick={() => void copy(node.entry.pathHash, "path hash")}
          >
            Copy Path Hash
          </ContextMenu.Item>
        </ContextMenu.Popup>
      </ContextMenu.Positioner>
    </ContextMenu.Portal>
  );
}

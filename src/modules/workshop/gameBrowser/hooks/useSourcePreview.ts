import { useCallback } from "react";

import type { WadSource } from "@/lib/tauri";

import { previewDocument } from "../../documents/utils/contentDocument";
import { useOpenDocument, useOpenRowPreview } from "../../state";
import { chunkAsset, useWadSource } from "../state/wadSource";
import type { SourceFileNode } from "../utils/sourceIndex";

/** What opening a game file row does, for either browser. */
export type OpenSourceFile = (node: SourceFileNode) => void;

/**
 * The preview document for one chunk of `source`.
 *
 * The chunk carries the archive it came from, which is the only route back to
 * its bytes once the index has folded its archives into one tree. The resolved
 * path goes with it, since the reference itself holds only the hash.
 */
function sourceDocument(source: WadSource, node: SourceFileNode) {
  return previewDocument(
    chunkAsset(source, node.entry.wad, node.entry.pathHash),
    node.entry.path ?? undefined,
  );
}

/** Open a chunk in a tab of its own, which is what a double click asks for. */
export function useSourcePreview(): OpenSourceFile {
  const source = useWadSource();
  const openDocument = useOpenDocument();
  return useCallback((node) => openDocument(sourceDocument(source, node)), [source, openDocument]);
}

/**
 * Open a chunk as the replaceable tab, which is what a single click asks for.
 *
 * Opens nothing while the preview setting is off, per "How a file opens" in
 * `docs/ux/PROJECT_EDITOR.md`.
 */
export function useSourceRowPreview(): OpenSourceFile {
  const source = useWadSource();
  const previewRow = useOpenRowPreview();
  return useCallback((node) => previewRow(sourceDocument(source, node)), [source, previewRow]);
}

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";

import type { AppError, AssetRef, BinDocumentId, SkinModel } from "@/lib/tauri";

import { declaredElsewhere } from "../linkDecision";
import { useBinDocument } from "../useBinDocument";
import { useLinkTargets } from "../useLinkTargets";
import { skinQueries } from "./skinQueries";

/** Where an animation graph is read from: the document to ask, and the graph's own hash. */
export interface GraphSource {
  /** The document the read goes through, and null while a foreign one opens. */
  readonly document: BinDocumentId | null;
  /** The `AnimationGraphData` object, `0x` and eight hex digits, and null where the skin names none. */
  readonly graph: string | null;
}

/** What a skin's graph read needs: the skin, its source, and the opener to mount. */
export interface SkinGraphSource {
  readonly skin: UseQueryResult<SkinModel, AppError>;
  readonly source: GraphSource;
  /** Mounted beside the reader, which holds a graph another file declares open. */
  readonly opener: ReactNode;
}

/**
 * The source a skin's graph is read through.
 *
 * A graph the index says another file declares is read through a second handle, as the
 * idle effect table reads a foreign resolver. Every other graph is read through the
 * skin's own document, which looks in the files it links.
 */
export function useSkinGraphSource(
  document: BinDocumentId,
  asset: AssetRef,
  entry: string,
): SkinGraphSource {
  const skin = useQuery(skinQueries.skin(document, entry));
  const targets = useLinkTargets();
  const graph = skin.data?.animationGraph ?? null;
  const elsewhere = graph === null ? null : declaredElsewhere(graph, targets, asset);
  const [opened, setOpened] = useState<BinDocumentId | null>(null);

  const opener = elsewhere !== null && graph !== null && (
    <GraphOpener asset={elsewhere} graph={graph} onOpen={setOpened} />
  );
  return {
    skin,
    source: { document: elsewhere === null ? document : opened, graph },
    opener,
  };
}

interface GraphOpenerProps {
  readonly asset: AssetRef;
  readonly graph: string;
  readonly onOpen: (document: BinDocumentId | null) => void;
}

/** The graph another file declares, held open beside the skin's own document. */
function GraphOpener({ asset, graph, onOpen }: GraphOpenerProps) {
  return <DocumentOpener asset={asset} entry={graph} onOpen={onOpen} />;
}

export interface DocumentOpenerProps {
  readonly asset: AssetRef;
  /** The object the open is narrowed to, `0x` and eight hex digits, and null for the whole file. */
  readonly entry?: string | null;
  /** The handle once the file is open, and null while it opens and once this unmounts. */
  readonly onOpen: (document: BinDocumentId | null) => void;
}

/** A linked file held open for as long as this is mounted, its handle reported to the owner. */
export function DocumentOpener({ asset, entry = null, onOpen }: DocumentOpenerProps) {
  const { state } = useBinDocument(asset, entry);
  const opened = state.status === "open" ? state.handle.document : null;
  useEffect(() => {
    onOpen(opened);
    return () => onOpen(null);
  }, [opened, onOpen]);
  return null;
}

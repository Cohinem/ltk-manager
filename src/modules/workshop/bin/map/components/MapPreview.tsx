import { lazy, Suspense } from "react";

import { m } from "@/i18n";
import type { BinDocumentId } from "@/lib/tauri";

import { Notice } from "../../vfx/preview/components/Notice";

/** The map viewport, in a chunk of its own as the skin viewport is. */
const MapViewport = lazy(() => import("./MapViewport"));

/** Start that chunk's fetch, so the preview's first paint is not what asks for it. */
export function preloadMapViewport(): void {
  void import("./MapViewport");
}

export interface MapPreviewProps {
  document: BinDocumentId;
  /** The `Map`, `MapSkin` or `MapContainer` object, and null where the view holds no row. */
  entry: string | null;
}

/** The map an object of a map's own classes draws, filling whatever holds it. */
export function MapPreview({ document, entry }: MapPreviewProps) {
  return (
    <div
      data-ui="MapPreview"
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden select-none"
      role="group"
      aria-label={m.workshop_bin_map_preview_label()}
    >
      {entry === null && <Notice text={m.workshop_bin_map_preview_missing_empty()} />}
      {entry !== null && (
        <Suspense fallback={<Notice text={m.workshop_bin_map_preview_loading_label()} />}>
          <MapViewport document={document} entry={entry} />
        </Suspense>
      )}
    </div>
  );
}

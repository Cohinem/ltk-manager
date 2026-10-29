import { useMutation } from "@tanstack/react-query";
import { save } from "@tauri-apps/plugin-dialog";

import { useToast } from "@/components";
import { useCopyToClipboard } from "@/hooks";
import { m } from "@/i18n";
import { api, type AppError, type AssetRef, type MediaExport, type MediaRow } from "@/lib/tauri";
import { mutationFn } from "@/utils/query";

import { decodedExtension } from "../utils/mediaRows";

interface ExportRequest {
  readonly source: number;
  readonly form: MediaExport;
  readonly destination: string;
}

/** The actions of one media row: save it decoded, save its WEM bytes, copy its source ID. */
export interface MediaActions {
  readonly saveDecoded: (row: MediaRow) => void;
  readonly saveOriginal: (row: MediaRow) => void;
  readonly copySource: (row: MediaRow) => void;
  readonly busy: boolean;
}

/**
 * Returns the row actions of the audio file `asset`, whose name is `name`.
 *
 * A save asks for its destination through the save dialog, and a dismissed dialog writes
 * nothing.
 */
export function useMediaActions(asset: AssetRef, name: string): MediaActions {
  const { success } = useToast();
  const copy = useCopyToClipboard();

  const exportMedia = useMutation<null, AppError, ExportRequest>({
    meta: { errorTitle: m.audio_export_failed_title() },
    mutationFn: mutationFn(({ source, form, destination }: ExportRequest) =>
      api.exportAudioMedia(asset, source, form, destination),
    ),
    onSuccess: (_, { destination }) => success(m.audio_exported_title(), destination),
  });

  async function saveAs(row: MediaRow, form: MediaExport, extension: string) {
    const destination = await save({
      defaultPath: `${fileStem(row, name)}.${extension}`,
      filters: [{ name: extension, extensions: [extension] }],
    });
    if (destination === null) return;

    exportMedia.mutate({ source: row.sourceId, form, destination });
  }

  return {
    saveDecoded: (row) => void saveAs(row, "decoded", decodedExtension(row)),
    saveOriginal: (row) => void saveAs(row, "original", "wem"),
    copySource: (row) => void copy(String(row.sourceId), m.audio_copy_source_label()),
    busy: exportMedia.isPending,
  };
}

/** The name a saved media opens on: its source ID, or the file's own name for a WEM. */
function fileStem(row: MediaRow, name: string): string {
  if (row.sourceId !== 0) return String(row.sourceId);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

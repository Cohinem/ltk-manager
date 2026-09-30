import { useMutation } from "@tanstack/react-query";
import { save } from "@tauri-apps/plugin-dialog";
import { useCallback } from "react";

import { useToast } from "@/components";
import { errorSummary, m } from "@/i18n";
import { api, type AppError } from "@/lib/tauri";
import { mutationFn } from "@/utils/query";

import { type ExportedSprite, spriteFileName } from "../engine/model/sprites";

export interface SpriteExport {
  readonly exporting: boolean;
  /** Ask where to save `sprite`, and write it there as a PNG at its page's resolution. */
  readonly run: (sprite: ExportedSprite) => Promise<void>;
}

/**
 * Exporting a sprite as a PNG an image editor opens, unflipped and at its page's own size, so the
 * edited file comes back through Replace image in place of the sprite.
 */
export function useSpriteExport(): SpriteExport {
  const toast = useToast();

  const write = useMutation<null, AppError, ExportedSprite & { destination: string }>({
    meta: { silentError: true },
    mutationFn: mutationFn(({ asset, uv, destination }) =>
      api.bin.atlasExportSprite(asset, uv, destination),
    ),
    onSuccess: (_, { destination }) =>
      toast.success(m.workshop_bin_atlas_sprites_exported(), destination),
    onError: (error) =>
      toast.error(m.workshop_bin_atlas_sprites_export_failed(), errorSummary(error)),
  });
  const { mutateAsync } = write;

  const run = useCallback(
    async (sprite: ExportedSprite) => {
      const destination = await save({
        title: m.workshop_bin_atlas_sprites_export_action(),
        defaultPath: spriteFileName(sprite.label),
        filters: [{ name: m.workshop_bin_atlas_sprites_png_filter(), extensions: ["png"] }],
      });
      if (destination === null) return;

      await mutateAsync({ ...sprite, destination }).catch(() => undefined);
    },
    [mutateAsync],
  );

  return { exporting: write.isPending, run };
}

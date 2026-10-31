import { useMutation } from "@tanstack/react-query";
import { save } from "@tauri-apps/plugin-dialog";

import { useToast } from "@/components/Toast";
import { m } from "@/i18n";
import { api, type AppError, type AssetRef } from "@/lib/tauri";
import { mutationFn } from "@/utils/query";

/** The press that writes an asset where the user picks, and whether a write runs. */
export interface SaveCopy {
  readonly run: () => Promise<void>;
  readonly pending: boolean;
}

/**
 * Returns the press that writes `asset` to a file that the user names in a save dialog.
 *
 * The dialog opens on `name`. A dismissed dialog writes nothing and raises no toast.
 */
export function useSaveCopy(asset: AssetRef, name: string): SaveCopy {
  const { success } = useToast();

  const saveCopy = useMutation<null, AppError, string>({
    meta: { errorTitle: m.workshop_preview_save_copy_failed_title() },
    mutationFn: mutationFn((destination: string) => api.saveAssetCopy(asset, destination)),
    onSuccess: () => success(m.workshop_preview_save_copy_saved_title(), name),
  });

  async function run() {
    const destination = await save({
      defaultPath: name,
      title: m.workshop_preview_save_copy_dialog_title(),
    });
    if (destination === null) return;

    saveCopy.mutate(destination);
  }

  return { run, pending: saveCopy.isPending };
}

import { FloppyDiskIcon } from "@phosphor-icons/react";

import { IconButton } from "@/components";
import { m } from "@/i18n";
import type { AssetRef } from "@/lib/tauri";

import { useSaveCopy } from "../hooks/useSaveCopy";

interface SaveCopyActionProps {
  asset: AssetRef;
  /** The file name the dialog opens on, which is the tab's own title. */
  name: string;
}

/**
 * Write the open asset somewhere the user picks.
 *
 * The extract of one file, and deliberately not through the extractor: the user
 * names the file in a save dialog, so the naming rules the extractor applies to
 * a whole archive have nothing to decide. A modder with the texture already
 * open should not have to go back to the tree for it.
 */
export function SaveCopyAction({ asset, name }: SaveCopyActionProps) {
  const saveCopy = useSaveCopy(asset, name);

  return (
    <IconButton
      icon={<FloppyDiskIcon />}
      onClick={() => void saveCopy.run()}
      disabled={saveCopy.pending}
      aria-label={m.workshop_preview_save_copy_label({ name })}
      tooltip={m.workshop_preview_save_copy_action()}
    />
  );
}

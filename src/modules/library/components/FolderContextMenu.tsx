import { Pencil, Power, PowerOff, Trash2 } from "lucide-react";
import { useState } from "react";

import { ContextMenu } from "@/components";
import { m } from "@/i18n";

import { useDeleteFolder, useRenameFolder, useToggleFolder } from "../api";
import { FolderNameDialog } from "./FolderNameDialog";

interface FolderContextMenuProps {
  folderId: string;
  folderName: string;
  children: React.ReactNode;
}

export function FolderContextMenu({ folderId, folderName, children }: FolderContextMenuProps) {
  const deleteFolder = useDeleteFolder();
  const toggleFolder = useToggleFolder();
  const renameFolder = useRenameFolder();
  const [renameOpen, setRenameOpen] = useState(false);

  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger data-folder-item className="h-full">
          {children}
        </ContextMenu.Trigger>
        <ContextMenu.Content>
          <ContextMenu.Item
            icon={<Pencil className="size-4" />}
            onClick={() => setRenameOpen(true)}
          >
            Rename
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item
            icon={<Power className="size-4" />}
            onClick={() => toggleFolder.mutate({ folderId, enabled: true })}
          >
            Enable All
          </ContextMenu.Item>
          <ContextMenu.Item
            icon={<PowerOff className="size-4" />}
            onClick={() => toggleFolder.mutate({ folderId, enabled: false })}
          >
            Disable All
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item
            icon={<Trash2 className="size-4" />}
            variant="danger"
            onClick={() => deleteFolder.mutate(folderId)}
          >
            Delete
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Root>
      <FolderNameDialog
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title={m.library_folder_rename_title()}
        submitLabel={m.library_folder_rename_action()}
        initialName={folderName}
        isPending={renameFolder.isPending}
        onSubmit={(newName) =>
          renameFolder.mutate({ folderId, newName }, { onSuccess: () => setRenameOpen(false) })
        }
      />
    </>
  );
}

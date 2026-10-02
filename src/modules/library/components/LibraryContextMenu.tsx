import { FolderPlus } from "lucide-react";
import { useState } from "react";

import { ContextMenu } from "@/components";
import { m } from "@/i18n";
import { useCreateFolder } from "@/modules/library/api";

import { FolderNameDialog } from "./FolderNameDialog";

interface LibraryContextMenuProps {
  children: React.ReactNode;
}

export function LibraryContextMenu({ children }: LibraryContextMenuProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const createFolder = useCreateFolder();

  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger className="flex min-h-0 flex-1 flex-col">
          {children}
        </ContextMenu.Trigger>
        <ContextMenu.Content>
          <ContextMenu.Item
            icon={<FolderPlus className="size-4" />}
            onClick={() => setDialogOpen(true)}
          >
            New Folder
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Root>
      <FolderNameDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={m.library_folder_new_title()}
        submitLabel={m.library_folder_create_action()}
        isPending={createFolder.isPending}
        onSubmit={(name) => createFolder.mutate(name, { onSuccess: () => setDialogOpen(false) })}
      />
    </>
  );
}

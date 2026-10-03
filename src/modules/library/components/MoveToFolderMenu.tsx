import {
  FolderMinusIcon,
  FolderPlusIcon,
  FoldersIcon,
  FolderSimpleIcon,
} from "@phosphor-icons/react";
import { useMemo } from "react";

import { Menu } from "@/components";
import { m } from "@/i18n";
import type { InstalledMod, LibraryFolder } from "@/lib/tauri";
import {
  useCreateFolder,
  useFolderOrder,
  useFolders,
  useMoveModsToFolder,
} from "@/modules/library/api";
import { useDialog } from "@/stores";

import { useNewFolderForModsDialog } from "../state";
import { FolderNameDialog } from "./FolderNameDialog";

const ROOT_FOLDER_ID = "root";

const folderOf = (mod: InstalledMod) => mod.folderId ?? ROOT_FOLDER_ID;

/** User folders in their stored order. */
function useUserFolders(): LibraryFolder[] {
  const { data: folders } = useFolders();
  const { data: order } = useFolderOrder();

  return useMemo(() => {
    const byId = new Map((folders ?? []).map((folder) => [folder.id, folder]));
    return (order ?? [])
      .filter((id) => id !== ROOT_FOLDER_ID)
      .map((id) => byId.get(id))
      .filter((folder): folder is LibraryFolder => folder !== undefined);
  }, [folders, order]);
}

/**
 * Where a set of mods can be filed: each folder, out of every folder, or a new one.
 *
 * Hangs under any menu root, so a mod's menu and the selection bar offer the
 * same destinations.
 */
export function MoveToFolderItems({ mods }: { mods: InstalledMod[] }) {
  const folders = useUserFolders();
  const { move } = useMoveModsToFolder();
  const openNewFolder = useNewFolderForModsDialog((s) => s.open);

  const homes = new Set(mods.map(folderOf));
  const shared = homes.size === 1 ? [...homes][0] : null;
  const anyFiled = mods.some((mod) => folderOf(mod) !== ROOT_FOLDER_ID);

  return (
    <>
      {folders.map((folder) => (
        <Menu.Item
          key={folder.id}
          icon={<FolderSimpleIcon className="size-4" weight="bold" />}
          disabled={shared === folder.id}
          onClick={() => void move(mods, folder.id)}
        >
          {folder.name}
        </Menu.Item>
      ))}
      {folders.length > 0 && <Menu.Separator />}
      {anyFiled && (
        <Menu.Item
          icon={<FolderMinusIcon className="size-4" weight="bold" />}
          onClick={() => void move(mods, ROOT_FOLDER_ID)}
        >
          {m.library_mod_remove_from_folder_action()}
        </Menu.Item>
      )}
      <Menu.Item
        icon={<FolderPlusIcon className="size-4" weight="bold" />}
        onClick={() => openNewFolder(mods)}
      >
        {m.library_mod_move_to_new_folder_action()}
      </Menu.Item>
    </>
  );
}

/** A mod menu's Move to folder submenu. */
export function MoveToFolderSubmenu({ mods }: { mods: InstalledMod[] }) {
  return (
    <Menu.SubmenuRoot>
      <Menu.SubmenuTrigger icon={<FoldersIcon className="size-4" weight="bold" />}>
        {m.library_mod_move_to_folder_action()}
      </Menu.SubmenuTrigger>
      <Menu.SubmenuContent data-ui="MoveToFolderSubmenu">
        <MoveToFolderItems mods={mods} />
      </Menu.SubmenuContent>
    </Menu.SubmenuRoot>
  );
}

/** Names a new folder and files the mods it was raised with into it. */
export function NewFolderForModsDialog() {
  const { isOpen, payload, close } = useDialog(useNewFolderForModsDialog);
  const createFolder = useCreateFolder();
  const { move } = useMoveModsToFolder();

  function handleSubmit(name: string) {
    createFolder.mutate(name, {
      onSuccess: (folder) => {
        void move(payload ?? [], folder.id);
        close();
      },
    });
  }

  return (
    <FolderNameDialog
      open={isOpen}
      onClose={close}
      title={m.library_folder_new_title()}
      submitLabel={m.library_folder_create_action()}
      isPending={createFolder.isPending}
      onSubmit={handleSubmit}
    />
  );
}

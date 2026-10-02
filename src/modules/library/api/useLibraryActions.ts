import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";

import { useToast } from "@/components";
import { errorSummary, m } from "@/i18n";
import { api, type BulkInstallResult, unwrap } from "@/lib/tauri";
import { checkModForSkinhack } from "@/modules/library/utils/skinhackCheck";

import { MOD_ARCHIVE_EXTENSIONS } from "./modArchive";
import { useBulkInstallMods } from "./useBulkInstallMods";
import { useInstallMod } from "./useInstallMod";
import { useInstallProgress } from "./useInstallProgress";
import { useReorderMods } from "./useReorderMods";
import { useSetModsEnabled } from "./useSetModsEnabled";
import { useToggleMod } from "./useToggleMod";
import { useUninstallMod } from "./useUninstallMod";

export function useLibraryActions() {
  const installMod = useInstallMod();
  const bulkInstallMods = useBulkInstallMods();
  const toggleMod = useToggleMod();
  const uninstallMod = useUninstallMod();
  const reorderMods = useReorderMods();
  const { setEnabled } = useSetModsEnabled();
  const toast = useToast();

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importResult, setImportResult] = useState<BulkInstallResult | null>(null);
  const { progress: installProgress, reset: resetInstallProgress } = useInstallProgress();

  async function handleImportMods() {
    const files = await open({
      multiple: true,
      filters: [
        { name: m.library_import_archives_filter_label(), extensions: [...MOD_ARCHIVE_EXTENSIONS] },
        { name: "Modpkg", extensions: ["modpkg"] },
        { name: "Fantome", extensions: ["fantome", "zip"] },
      ],
    });

    if (!files) return;

    // Normalize: open() returns string | string[] depending on multiple flag
    const filePaths = Array.isArray(files) ? files : [files];

    if (filePaths.length === 1) {
      installMod.mutate(filePaths[0], {
        onError: (error) => {
          console.error("Failed to install mod:", error);
        },
      });
    } else if (filePaths.length > 1) {
      handleBulkInstallFiles(filePaths);
    }
  }

  function handleBulkInstallFiles(filePaths: string[]) {
    if (filePaths.length === 0) return;

    if (filePaths.length === 1) {
      installMod.mutate(filePaths[0], {
        onError: (error) => {
          console.error("Failed to install mod:", error);
        },
      });
      return;
    }

    setImportResult(null);
    resetInstallProgress();
    setImportDialogOpen(true);

    bulkInstallMods.mutate(filePaths, {
      onSuccess: (result) => {
        setImportResult(result);

        // Check installed mods for skinhacks and disable any flagged ones
        for (const mod of result.installed) {
          const flag = checkModForSkinhack(mod);
          if (flag) {
            api.toggleMod(mod.id, false);
            toast.warning(
              m.library_install_skinhack_title(),
              m.library_install_skinhack_description({ name: mod.displayName }),
            );
          }
        }

        announceImport(result);
      },
      onError: (error) => {
        handleCloseImportDialog();
        toast.error(m.library_import_failed_title(), errorSummary(error));
      },
    });
  }

  function announceImport({ installed, alreadyInstalled, failed }: BulkInstallResult) {
    const counts = {
      installed: installed.length,
      existing: alreadyInstalled.length,
      failed: failed.length,
    };

    if (counts.failed > 0 && counts.installed === 0 && counts.existing === 0) {
      toast.error(
        m.library_import_failed_title(),
        m.library_import_failed_description({ count: counts.failed }),
      );
    } else if (counts.failed > 0) {
      toast.warning(
        m.library_import_partial_title(),
        counts.existing > 0
          ? m.library_import_partial_existing_description(counts)
          : m.library_import_partial_description(counts),
      );
    } else if (counts.installed === 0) {
      toast.info(
        m.library_import_already_installed_title(),
        m.library_import_already_installed_description({ count: counts.existing }),
      );
    } else {
      toast.success(
        m.library_import_installed_title(),
        counts.existing > 0
          ? m.library_import_installed_existing_description(counts)
          : m.library_import_installed_description({ count: counts.installed }),
      );
    }
  }

  function handleCloseImportDialog() {
    setImportDialogOpen(false);
    setImportResult(null);
    resetInstallProgress();
  }

  function handleToggleMod(modId: string, enabled: boolean) {
    toggleMod.mutate(
      { modId, enabled },
      {
        onError: (error) => {
          console.error("Failed to toggle mod:", error);
        },
      },
    );
  }

  function handleUninstallMod(modId: string) {
    uninstallMod.mutate(modId, {
      onError: (error) => {
        console.error("Failed to uninstall mod:", error);
      },
    });
  }

  function handleReorder(modIds: string[]) {
    reorderMods.mutate(modIds);
  }

  async function handleOpenStorageDirectory() {
    try {
      const result = await api.getStorageDirectory();
      const path = unwrap(result);
      await api.revealInExplorer(path);
    } catch (error: unknown) {
      toast.error(
        m.library_storage_open_failed_title(),
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return {
    installMod,
    bulkInstallMods,
    toggleMod,
    handleImportMods,
    handleBulkInstallFiles,
    handleToggleMod,
    handleSetEnabledForMods: setEnabled,
    handleUninstallMod,
    handleReorder,
    handleOpenStorageDirectory,
    importDialogOpen,
    importResult,
    installProgress,
    handleCloseImportDialog,
  };
}

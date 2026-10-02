import { DownloadSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { Button, Kbd, Toolbar, ToolbarRow, Tooltip } from "@/components";
import { usePlatformSupport } from "@/hooks";
import { m } from "@/i18n";
import {
  LastGameTile,
  LibraryTile,
  NewsTile,
  NoticeBanners,
  StatusLine,
  useMarkHomeSeen,
  WhatsNew,
} from "@/modules/home";
import { PlayButton } from "@/modules/launcher";
import {
  DragDropOverlay,
  ImportProgressDialog,
  useLibraryActions,
  useLibraryHotkeys,
  useModFileDrop,
} from "@/modules/library";
import { MigrationWizardDialog } from "@/modules/migration";
import { PatcherUnsupported } from "@/modules/patcher";

/**
 * The page the manager opens on, per docs/ux/HOME.md.
 *
 * Framed as the library page is: its toolbar with Import and Play at the trailing edge, then an
 * inset region holding the cards. The drop, the import dialog and the migration wizard are the
 * library page's, mounted here again over this page's own actions. The two pages never mount
 * together, so a drop lands with whichever is up.
 */
export function Home() {
  const [migrationOpen, setMigrationOpen] = useState(false);

  const { data: platform } = usePlatformSupport();
  const patcherAvailable = platform?.patcherAvailable ?? true;

  const actions = useLibraryActions();
  const isDragOver = useModFileDrop(actions.handleBulkInstallFiles);
  useLibraryHotkeys(actions.handleImportMods);
  useMarkHomeSeen();

  const installing = actions.installMod.isPending || actions.bulkInstallMods.isPending;

  return (
    <div data-ui="Home" className="relative flex h-full flex-col">
      <DragDropOverlay visible={isDragOver} />

      <div className="flex flex-col gap-2 px-4 pt-3 empty:hidden">
        {!patcherAvailable && <PatcherUnsupported />}
        <NoticeBanners />
        <StatusLine />
      </div>

      <Toolbar>
        <ToolbarRow className="justify-end">
          <div className="flex items-center gap-5">
            <Tooltip
              content={
                <>
                  {m.home_library_add_hint()} <Kbd shortcut="Ctrl+I" />
                </>
              }
            >
              <Button
                variant="light"
                size="sm"
                onClick={actions.handleImportMods}
                loading={installing}
                aria-label={m.home_library_add_hint()}
                left={<DownloadSimpleIcon weight="bold" className="size-4" />}
              >
                {m.home_library_add_action()}
              </Button>
            </Tooltip>

            <PlayButton disabled={installing} />
          </div>
        </ToolbarRow>
      </Toolbar>

      <div className="relative mx-2 flex min-h-0 flex-1 flex-col">
        <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-surface-700 bg-surface-900 shadow-pressed">
          <div data-ui="Home:content" className="flex-1 overflow-auto p-6">
            <div className="mx-auto grid w-full max-w-7xl gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <WhatsNew />

              <div className="order-first flex min-w-0 flex-col gap-4 lg:order-none">
                <LibraryTile onImportFromCslol={() => setMigrationOpen(true)} />
                <LastGameTile />
                <NewsTile />
              </div>
            </div>
          </div>
        </div>
      </div>

      <ImportProgressDialog
        open={actions.importDialogOpen}
        onClose={actions.handleCloseImportDialog}
        progress={actions.installProgress}
        result={actions.importResult}
      />
      <MigrationWizardDialog open={migrationOpen} onClose={() => setMigrationOpen(false)} />
    </div>
  );
}

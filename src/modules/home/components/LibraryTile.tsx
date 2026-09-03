import { DownloadSimpleIcon, XIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";

import { Button, CollectionIcon, IconButton } from "@/components";
import { m } from "@/i18n";
import { useActiveProfile, useInstalledMods } from "@/modules/library";
import { useSaveSettings, useSettings } from "@/modules/settings";

import { Tile } from "./Tile";

interface LibraryTileProps {
  /** Runs the library's import. */
  onAddMod: () => void;
  /** Opens the migration wizard. */
  onImportFromCslol: () => void;
}

/** The library's state on the front page, and the two ways into it. */
export function LibraryTile({ onAddMod, onImportFromCslol }: LibraryTileProps) {
  const { data: profile } = useActiveProfile();
  const { data: mods = [] } = useInstalledMods();
  const { data: settings } = useSettings();
  const saveSettings = useSaveSettings();
  const navigate = useNavigate();

  const enabled = mods.filter((mod) => mod.enabled).length;
  const offerImport = settings !== undefined && !settings.migrationDismissed;

  function dismissImport() {
    if (!settings) return;
    saveSettings.mutate({ ...settings, migrationDismissed: true });
  }

  return (
    <Tile title={m.home_library_title()} data-ui="LibraryTile">
      <div className="flex flex-col gap-3 px-4 pb-4">
        <div className="select-none">
          <p className="text-sm font-medium text-surface-100 select-text">{profile?.name}</p>
          <p className="text-xs text-surface-400">
            {m.home_library_enabled_count_label({ enabled, total: mods.length })}
          </p>
        </div>

        {offerImport && (
          <div
            data-ui="LibraryTile:migration"
            className="flex flex-col gap-2 rounded-lg border border-info/30 bg-info/8 p-3 select-none"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-surface-100">
                {m.home_library_import_title()}
              </p>
              <IconButton
                icon={<XIcon className="h-4 w-4" />}
                variant="ghost"
                size="xs"
                compact
                aria-label={m.home_offer_dismiss_action()}
                onClick={dismissImport}
              />
            </div>
            <Button variant="outline" size="sm" className="self-start" onClick={onImportFromCslol}>
              {m.home_library_import_action()}
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="light"
            size="sm"
            left={<CollectionIcon className="h-4 w-4" />}
            onClick={() => void navigate({ to: "/mods" })}
          >
            {m.home_library_open_action()}
          </Button>
          <Button
            variant="outline"
            size="sm"
            left={<DownloadSimpleIcon weight="bold" className="h-4 w-4" />}
            onClick={onAddMod}
          >
            {m.home_library_add_action()}
          </Button>
        </div>
      </div>
    </Tile>
  );
}

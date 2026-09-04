import {
  DotsThreeVerticalIcon,
  DownloadSimpleIcon,
  ExportIcon,
  FolderOpenIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { Button, CollectionIcon, IconButton, Menu, Popover, SegmentedControl } from "@/components";
import { m } from "@/i18n";
import { api, type ExportScope, type ExportShape } from "@/lib/tauri";
import { useSaveSettings, useSettings } from "@/modules/settings";

import { useExportMods, useLibraryFacts } from "../api";
import { LibraryHealthMarker } from "./LibraryHealthMarker";
import { Tile } from "./Tile";

interface LibraryTileProps {
  /** Runs the library's import. */
  onAddMod: () => void;
  /** Opens the migration wizard. */
  onImportFromCslol: () => void;
}

/** The library's state on the front page, and the ways into it and out of it. */
export function LibraryTile({ onAddMod, onImportFromCslol }: LibraryTileProps) {
  const { profileName, enabledLabel, enabled, total } = useLibraryFacts();
  const { data: settings } = useSettings();
  const saveSettings = useSaveSettings();
  const navigate = useNavigate();

  const anchor = useRef<HTMLDivElement>(null);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [scope, setScope] = useState<ExportScope>("all");
  const [shape, setShape] = useState<ExportShape>("folder");
  const exportMods = useExportMods();

  const offerImport = settings !== undefined && !settings.migrationDismissed;
  const scopedCount = scope === "enabled" ? enabled : total;

  function dismissImport() {
    if (!settings) return;
    saveSettings.mutate({ ...settings, migrationDismissed: true });
  }

  /* The scrim is for choosing. Once there is a destination the decision is
     made, so the chooser goes and the run reports where a click cannot reach
     it, per "Export" in docs/ux/HOME.md. */
  async function runExport() {
    if (await exportMods.start(scope, shape)) setChooserOpen(false);
  }

  async function openStorage() {
    const storage = await api.getStorageDirectory();
    if (storage.ok) await api.revealInExplorer(storage.value);
  }

  return (
    <Tile
      title={m.home_library_title()}
      data-ui="LibraryTile"
      action={
        <div ref={anchor} className="inline-flex">
          <Menu.Root>
            <Menu.Trigger
              render={
                <IconButton
                  icon={<DotsThreeVerticalIcon className="h-4 w-4" />}
                  variant="ghost"
                  size="xs"
                  compact
                  aria-label={m.home_library_more_action()}
                />
              }
            />
            <Menu.Portal>
              <Menu.Positioner>
                <Menu.Popup>
                  <Menu.Item
                    icon={<ExportIcon className="h-4 w-4" />}
                    /* The menu is still closing, and it takes focus back first. */
                    onClick={() => setTimeout(() => setChooserOpen(true), 0)}
                  >
                    {m.home_library_export_action()}
                  </Menu.Item>
                  <Menu.Item
                    icon={<FolderOpenIcon className="h-4 w-4" />}
                    onClick={() => void openStorage()}
                  >
                    {m.home_library_storage_action()}
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>

          <Popover.Root modal open={chooserOpen} onOpenChange={setChooserOpen}>
            <Popover.Portal>
              <Popover.Backdrop className="bg-scrim backdrop-blur-sm transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
              <Popover.Positioner anchor={anchor} side="bottom" align="end" sideOffset={8}>
                <Popover.Popup className="w-72 p-3" data-ui="LibraryTile:export">
                  <Popover.Title>{m.home_library_export_title()}</Popover.Title>

                  <div className="mt-3 flex flex-col gap-1.5">
                    <p className="text-xs font-medium text-surface-300">
                      {m.home_library_export_scope_label()}
                    </p>
                    <SegmentedControl
                      className="w-full"
                      value={scope}
                      onChange={setScope}
                      options={[
                        { value: "all", label: m.home_library_export_scope_all_label() },
                        { value: "enabled", label: m.home_library_export_scope_enabled_label() },
                      ]}
                    />
                  </div>

                  <div className="mt-3 flex flex-col gap-1.5">
                    <p className="text-xs font-medium text-surface-300">
                      {m.home_library_export_shape_label()}
                    </p>
                    <SegmentedControl
                      className="w-full"
                      value={shape}
                      onChange={setShape}
                      options={[
                        { value: "folder", label: m.home_library_export_shape_folder_label() },
                        { value: "zip", label: m.home_library_export_shape_zip_label() },
                      ]}
                    />
                  </div>

                  <p className="mt-3 text-xs text-surface-400">
                    {m.home_library_export_count_hint({ count: scopedCount })}
                  </p>

                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="filled"
                      size="sm"
                      className="flex-1"
                      left={<ExportIcon weight="bold" className="h-4 w-4" />}
                      onClick={() => void runExport()}
                    >
                      {m.home_library_export_confirm_action()}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setChooserOpen(false)}>
                      {m.common_cancel_action()}
                    </Button>
                  </div>
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        </div>
      }
    >
      <div className="flex flex-col gap-3 px-4 pb-4">
        <div className="select-none">
          <p className="text-sm font-medium text-surface-100 select-text">{profileName}</p>
          <p className="text-xs text-surface-400">{enabledLabel}</p>
        </div>

        <LibraryHealthMarker />

        {exportMods.running && (
          <div data-ui="LibraryTile:export-run" className="flex flex-col gap-1.5 select-none">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-medium text-surface-200">
                {m.home_library_export_running_label()}
              </p>
              {exportMods.progress && (
                <p className="text-xs text-surface-400">
                  {exportMods.progress.current} / {exportMods.progress.total}
                </p>
              )}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-700">
              <div
                className="h-full rounded-full bg-accent-500 transition-[width] duration-200"
                style={{
                  width: exportMods.progress
                    ? `${(exportMods.progress.current / Math.max(1, exportMods.progress.total)) * 100}%`
                    : "0%",
                }}
              />
            </div>
            <p className="truncate text-xs text-surface-400 select-text">
              {exportMods.progress?.currentMod}
            </p>
          </div>
        )}

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
                aria-label={m.home_library_import_dismiss_action()}
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

import { CaretDownIcon, LockSimpleIcon, SealCheckIcon, StackPlusIcon } from "@phosphor-icons/react";

import { Button, Menu } from "@/components";
import { m } from "@/i18n";
import type { AssetRef } from "@/lib/tauri";

import { useExtractActions } from "../../../gameBrowser/extraction/hooks/useExtractActions";
import { chunkTarget } from "../../../gameBrowser/extraction/utils/extractTargets";
import { useSetUseDeclarations } from "../../../state";

interface DeclarationsOffMenuProps {
  asset: AssetRef;
  /** The chunk's path inside its archive, or its hash where no table names it. */
  file: string;
  /** What the copy's progress names. */
  subject: string;
}

/**
 * The toolbar's read-only mark for a game bin whose project has declarations off. It opens
 * the two ways to edit the bin: turn declarations on, or copy the chunk into the selected
 * layer. "Game data declarations" in docs/ux/BIN_EDITOR.md.
 */
export function DeclarationsOffMenu({ asset, file, subject }: DeclarationsOffMenuProps) {
  const { run, layerLabel, busy } = useExtractActions();
  const setUseDeclarations = useSetUseDeclarations();

  const target = asset.kind === "gameChunk" ? chunkTarget(asset, `${asset.wad}/${file}`) : null;

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            variant="ghost"
            size="xs"
            className="shrink-0"
            left={<LockSimpleIcon className="size-3.5" />}
            right={<CaretDownIcon weight="bold" className="size-3" />}
          >
            {m.workshop_bin_read_only_label()}
          </Button>
        }
      />
      <Menu.Content align="end" sideOffset={4} data-ui="DeclarationsOffMenu" className="w-64">
        <Menu.Group>
          <Menu.GroupLabel>{m.workshop_bin_declarations_off_title()}</Menu.GroupLabel>
          <Menu.Item
            icon={<SealCheckIcon weight="bold" className="size-4" />}
            onClick={() => setUseDeclarations(true)}
          >
            {m.workshop_bin_declarations_declare_action()}
          </Menu.Item>
          {target && layerLabel && (
            <Menu.Item
              icon={<StackPlusIcon weight="bold" className="size-4" />}
              disabled={busy}
              onClick={() => run("copy", [target], subject)}
            >
              {m.workshop_preview_copy_into_action({ layer: layerLabel })}
            </Menu.Item>
          )}
        </Menu.Group>
      </Menu.Content>
    </Menu.Root>
  );
}

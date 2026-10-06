import { useMemo } from "react";

import { LeagueIcon, Menu } from "@/components";
import { m } from "@/i18n";
import type { AssetRef, ObjectDeclaration, SandboxRef } from "@/lib/tauri";

import { useObjectDeclarations, useWarmObjectIndex } from "../../../gameBrowser";
import { LayerGlyph } from "../../../layers/components/LayerGlyph";
import { assetContext, assetKey } from "../../../preview/utils/assetRef";
import { GAME_SANDBOX } from "../../../sandbox/utils/sandboxRef";
import { useLayerTitle } from "../../links/hooks/useLinkTargets";
import { SandboxRadioItem } from "./SandboxRadioItem";

const NO_FILES: readonly ObjectDeclaration[] = [];

/** The files declaring one object, in the project's sandbox and in the game. */
export interface DeclaringFiles {
  /** In the route's sandbox: the layers' files, then the install's that no layer ships. */
  readonly inRoute: readonly ObjectDeclaration[];
  /** In the installed game alone, in archive order. */
  readonly inGame: readonly ObjectDeclaration[];
  /** Whether the object index has not been built, so the install's files are unknown. */
  readonly unindexed: boolean;
}

/**
 * The files declaring `objectHash` in `route` and in the game, and none for a null hash.
 *
 * The backend orders a sandbox's list as it resolves the object, so the first file of a list
 * is the one a tab switched to that sandbox reads (ADR-0056).
 */
export function useDeclaringFiles(objectHash: string | null, route: SandboxRef): DeclaringFiles {
  const hashes = useMemo(() => (objectHash === null ? [] : [objectHash]), [objectHash]);
  const routed = useObjectDeclarations(hashes, route).data;
  const game = useObjectDeclarations(hashes, GAME_SANDBOX).data;

  return useMemo(() => {
    const of = (answer: typeof game) =>
      objectHash === null ? NO_FILES : (answer?.objects[objectHash]?.declarations ?? NO_FILES);

    return {
      inRoute: of(routed),
      inGame: of(game),
      unindexed: objectHash !== null && game?.index.status === "absent",
    };
  }, [objectHash, routed, game]);
}

interface SandboxFilesProps {
  /** The files declaring the tab's object in the sandbox the tab reads. */
  files: readonly ObjectDeclaration[];
  /** The file the tab reads. */
  current: AssetRef;
  unindexed: boolean;
  onPick: (file: ObjectDeclaration) => void;
}

/**
 * The files declaring an object tab's object in its sandbox, as one choice of the Sandbox
 * options. Picking a file switches the tab to that declaration in place.
 *
 * Left out where one file declares the object. With no object index built, the game's files
 * are unknown, and the group offers the build instead. "The sandbox" in docs/ux/BIN_EDITOR.md.
 */
export function SandboxFiles({ files, current, unindexed, onPick }: SandboxFilesProps) {
  const layerTitle = useLayerTitle();
  const warm = useWarmObjectIndex();

  if (unindexed) {
    return (
      <>
        <Menu.Separator />
        <Menu.Group>
          <Menu.GroupLabel>{m.workshop_bin_sandbox_files_label()}</Menu.GroupLabel>
          <Menu.Item disabled={warm.isPending} onClick={() => warm.mutate()}>
            {m.workshop_bin_build_index_action()}
          </Menu.Item>
        </Menu.Group>
      </>
    );
  }
  if (files.length < 2) return null;

  return (
    <>
      <Menu.Separator />
      <Menu.Group>
        <Menu.GroupLabel>{m.workshop_bin_sandbox_files_label()}</Menu.GroupLabel>
        <Menu.RadioGroup
          value={assetKey(current)}
          onValueChange={(key: string) => {
            const file = files.find((each) => assetKey(each.asset) === key);
            if (file !== undefined) onPick(file);
          }}
        >
          {files.map((file) => (
            <SandboxRadioItem
              key={assetKey(file.asset)}
              value={assetKey(file.asset)}
              closeOnClick
              icon={<FileGlyph asset={file.asset} />}
              note={
                file.asset.kind === "layer"
                  ? layerTitle(file.asset.layer)
                  : assetContext(file.asset)
              }
            >
              {fileName(file.file)}
            </SandboxRadioItem>
          ))}
        </Menu.RadioGroup>
      </Menu.Group>
    </>
  );
}

/** The layer's glyph for a layer file, and the League icon for a file of the game. */
function FileGlyph({ asset }: { asset: AssetRef }) {
  /* DS-KIND-HUE */
  if (asset.kind === "layer") return <LayerGlyph layerName={asset.layer} />;

  return <LeagueIcon className="size-3.5 shrink-0" />;
}

/** The last segment of a declaring file's path. */
function fileName(file: string): string {
  return file.slice(Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\")) + 1);
}

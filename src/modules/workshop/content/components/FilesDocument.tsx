import {
  ArrowsClockwiseIcon,
  CaretDownIcon,
  FileArchiveIcon,
  FolderIcon,
  FolderOpenIcon,
  PlusIcon,
} from "@phosphor-icons/react";

import { Button, EmptyState, IconButton, Menu } from "@/components";
import { m } from "@/i18n";
import { api, type LayerContent } from "@/lib/tauri";
import { DocumentToolbar, type EditorDocumentProps } from "@/modules/editor";

import { useProjectContentTree } from "../../api";
import { type ContentDocumentOf, layerTitle } from "../../documents/utils/contentDocument";
import { useLayerWadImport } from "../../hooks";
import { useProjectContext } from "../../projects/state/ProjectContext";
import { CollapseAllButton } from "../../shared/components/CollapseAllButton";
import { DocumentFrame } from "../../shared/components/DocumentFrame";
import { useCollapseLayerDirs } from "../../state";
import { allDirPaths, buildContentTree } from "../utils/contentTree";
import { ContentTree } from "./ContentTree";

/** A layer's content directory, as the tree of what is on disk. */
export function FilesDocument({
  document,
  active,
}: EditorDocumentProps<ContentDocumentOf<"files">>) {
  const project = useProjectContext();
  const { data, isFetching, refetch } = useProjectContentTree(project.path);

  const layerName = document.layerName;
  const displayName = layerTitle(project, layerName);
  const layer = data?.layers.find((candidate) => candidate.name === layerName) ?? null;

  const wadImport = useLayerWadImport({
    projectPath: project.path,
    layerName,
    layerDisplayName: displayName,
  });

  const collapseLayerDirs = useCollapseLayerDirs();

  async function handleOpenFolder() {
    await api.revealInExplorer(`${project.path}/content/${layerName}`);
  }

  function handleCollapseAll() {
    if (!layer) return;

    collapseLayerDirs(
      layerName,
      allDirPaths(buildContentTree(layer.entries, layer.ignoredDirectories)),
    );
  }

  return (
    <DocumentFrame data-ui="FilesDocument">
      <DocumentToolbar active={active}>
        <Menu.Root>
          <Menu.Trigger
            render={
              <Button
                variant="ghost"
                size="xs"
                loading={wadImport.isPending}
                left={<PlusIcon weight="bold" className="size-4" />}
                right={<CaretDownIcon weight="bold" className="size-3" />}
              >
                {m.workshop_files_add_wad_action()}
              </Button>
            }
          />
          <Menu.Content align="end" sideOffset={4}>
            <Menu.Item icon={<FileArchiveIcon className="size-4" />} onClick={wadImport.pickFiles}>
              {m.workshop_files_add_wad_file_action()}
            </Menu.Item>
            <Menu.Item icon={<FolderIcon className="size-4" />} onClick={wadImport.pickFolder}>
              {m.workshop_files_add_wad_folder_action()}
            </Menu.Item>
          </Menu.Content>
        </Menu.Root>

        {layer && layer.entries.length > 0 && <CollapseAllButton onCollapse={handleCollapseAll} />}

        <IconButton
          icon={<RefreshIcon spinning={isFetching} />}
          onClick={() => refetch()}
          disabled={isFetching}
          aria-label={m.workshop_files_refresh_action()}
          tooltip={m.workshop_files_refresh_label()}
        />

        <IconButton
          icon={<FolderOpenIcon />}
          onClick={handleOpenFolder}
          aria-label={m.workshop_files_open_folder_action({ layer: layerName })}
          tooltip={m.workshop_files_open_folder_label()}
        />
      </DocumentToolbar>

      <FilesBody layer={layer} />
    </DocumentFrame>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  if (spinning) return <ArrowsClockwiseIcon className="size-4 animate-spin" />;
  return <ArrowsClockwiseIcon className="size-4" />;
}

interface FilesBodyProps {
  layer: LayerContent | null;
}

function FilesBody({ layer }: FilesBodyProps) {
  if (!layer) {
    return (
      <EmptyState
        size="sm"
        title={m.workshop_files_gone_title()}
        description={m.workshop_files_gone_description()}
      />
    );
  }

  if (layer.entries.length === 0) {
    return (
      <EmptyState
        size="sm"
        title={m.workshop_files_empty_title()}
        description={m.workshop_files_empty_description()}
      />
    );
  }

  return <ContentTree layer={layer} />;
}

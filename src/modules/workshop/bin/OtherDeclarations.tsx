import { CubeIcon, SpinnerGapIcon } from "@phosphor-icons/react";
import { useMemo } from "react";

import { Popover } from "@/components";
import { errorSummary, m } from "@/i18n";
import type { AssetRef, ObjectDeclaration } from "@/lib/tauri";

import { useProjectContentTree } from "../api/useProjectContentTree";
import { useProjectContext } from "../components/ProjectContext";
import { declaringFileContext, layerTitle, objectDocument } from "../documents/contentDocument";
import { useObjectDeclarations, useWarmObjectIndex } from "../gameBrowser";
import type { OpenIntent } from "../palette/types";
import { assetContext, assetKey } from "../preview/assetRef";
import { useOpenDocumentAs } from "../state";

interface OtherDeclarationsProps {
  /** The declaration the tab is over, which the list leaves out. */
  asset: AssetRef;
  /** `0x` and eight hex digits. */
  objectHash: string;
  /** The object's path, which every other declaration's tab is titled by. */
  objectPath: string;
}

/**
 * The other files declaring the tab's object, each opening its own tab.
 *
 * The install's come from the object index, the project's from the content scan.
 * "The object tab" in docs/ux/BIN_EDITOR.md.
 */
export function OtherDeclarations({ asset, objectHash, objectPath }: OtherDeclarationsProps) {
  const project = useProjectContext();
  const hashes = useMemo(() => [objectHash], [objectHash]);
  const { data, error } = useObjectDeclarations(hashes);
  const { data: tree } = useProjectContentTree(project.path);
  const warm = useWarmObjectIndex();
  const open = useOpenDocumentAs();

  const others = useMemo<readonly ObjectDeclaration[]>(() => {
    const self = assetKey(asset);
    const install = data?.objects[objectHash]?.declarations ?? [];
    const layers = (tree?.layers ?? []).flatMap((layer) =>
      layer.entries
        .filter((entry) => entry.objects.some((object) => object.objectHash === objectHash))
        .map((entry): ObjectDeclaration => {
          const object = entry.objects.find((candidate) => candidate.objectHash === objectHash);
          return {
            asset: {
              kind: "layer",
              project: project.path,
              layer: layer.name,
              path: entry.relativePath,
            },
            file: entry.relativePath,
            classHash: object?.classHash ?? "",
            class: object?.class ?? "",
          };
        }),
    );
    return [...install, ...layers].filter((declaration) => assetKey(declaration.asset) !== self);
  }, [asset, data, objectHash, project.path, tree]);

  if (error) return <span className="text-surface-400">{errorSummary(error)}</span>;
  if (data === undefined || data.index.status === "building" || warm.isPending) {
    return (
      <span className="flex items-center gap-1 text-surface-400">
        <SpinnerGapIcon className="h-3 w-3 animate-spin" />
        {m.workshop_objects_building_label()}
      </span>
    );
  }
  if (data.index.status === "failed") {
    return <span className="text-surface-400">{errorSummary(data.index.error)}</span>;
  }
  if (data.index.status === "absent") {
    return (
      <button
        type="button"
        className="cursor-pointer text-surface-400 underline decoration-dotted underline-offset-2 hover:text-surface-200"
        onClick={() => warm.mutate()}
      >
        {m.workshop_bin_build_index_action()}
      </button>
    );
  }

  if (others.length === 0) return <span>{m.workshop_bin_no_other_declarations_label()}</span>;

  const label = m.workshop_bin_other_declarations_label({ count: others.length });
  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <button
            type="button"
            className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-surface-200"
          />
        }
      >
        {label}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8}>
          <Popover.Popup aria-label={label} className="w-96 p-1">
            <ul data-ui="OtherDeclarations" className="flex flex-col">
              {others.map((declaration) => (
                <DeclarationRow
                  key={assetKey(declaration.asset)}
                  declaration={declaration}
                  layerName={
                    declaration.asset.kind === "layer"
                      ? layerTitle(project, declaration.asset.layer)
                      : null
                  }
                  onOpen={(intent) =>
                    open(
                      objectDocument(declaration.asset, objectHash, objectPath, declaration.file),
                      intent,
                    )
                  }
                />
              ))}
            </ul>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface DeclarationRowProps {
  declaration: ObjectDeclaration;
  /** The layer's title where the declaration is a layer's, else null. */
  layerName: string | null;
  onOpen: (intent: OpenIntent) => void;
}

/** One declaring file: its path, and the archive or the layer it sits in. */
function DeclarationRow({ declaration, layerName, onOpen }: DeclarationRowProps) {
  const where = layerName ?? assetContext(declaration.asset);
  return (
    <li>
      <button
        type="button"
        /* DS-VEIL, DS-RADIUS */
        className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-left text-meta hover:bg-surface-veil"
        title={declaringFileContext(declaration.asset, declaration.file)}
        onClick={(event) => onOpen(event.ctrlKey || event.metaKey ? "beside" : "default")}
      >
        <CubeIcon className="h-3.5 w-3.5 shrink-0 text-surface-400" />
        <span className="min-w-0 flex-1 truncate font-mono text-code text-surface-200">
          {declaration.file}
        </span>
        {where !== undefined && <span className="shrink-0 text-surface-400">{where}</span>}
      </button>
    </li>
  );
}

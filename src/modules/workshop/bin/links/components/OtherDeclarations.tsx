import { SpinnerGapIcon } from "@phosphor-icons/react";
import { type ReactNode, useMemo } from "react";

import { Popover } from "@/components";
import { errorSummary, m } from "@/i18n";
import type { AssetRef, ObjectDeclaration } from "@/lib/tauri";

import { useObjectDeclarations, useWarmObjectIndex } from "../../../gameBrowser";
import { assetKey } from "../../../preview/utils/assetRef";
import { useSandbox } from "../../../sandbox/state/SandboxContext";
import { Dot } from "../../documents/components/BinDocument";
import { useLayerTitle } from "../hooks/useLinkTargets";
import { DeclarationList } from "./DeclarationList";

interface OtherDeclarationsProps {
  /** The declaration the tab is over, which the list leaves out. */
  asset: AssetRef;
  /** `0x` and eight hex digits. */
  objectHash: string;
  /** The object's path, which every other declaration's tab is titled by. */
  objectPath: string;
}

/**
 * The other files declaring the tab's object in its sandbox, each opening its own tab.
 *
 * The backend returns the install's and the layers' declarations together (ADR-0056). "The
 * object tab" in docs/ux/BIN_EDITOR.md.
 */
export function OtherDeclarations({ asset, objectHash, objectPath }: OtherDeclarationsProps) {
  const hashes = useMemo(() => [objectHash], [objectHash]);
  const { data, error } = useObjectDeclarations(hashes, useSandbox());
  const warm = useWarmObjectIndex();
  const title = useLayerTitle();

  const others = useMemo<readonly ObjectDeclaration[]>(() => {
    const self = assetKey(asset);
    return (data?.objects[objectHash]?.declarations ?? []).filter(
      (declaration) => assetKey(declaration.asset) !== self,
    );
  }, [asset, data, objectHash]);

  if (error) {
    return (
      <Dotted>
        <span className="text-surface-400">{errorSummary(error)}</span>
      </Dotted>
    );
  }
  if (data === undefined || data.index.status === "building" || warm.isPending) {
    return (
      <Dotted>
        <span className="flex items-center gap-1 text-surface-400">
          <SpinnerGapIcon className="size-3 animate-spin" />
          {m.workshop_objects_building_label()}
        </span>
      </Dotted>
    );
  }
  if (data.index.status === "failed") {
    return (
      <Dotted>
        <span className="text-surface-400">{errorSummary(data.index.error)}</span>
      </Dotted>
    );
  }
  if (data.index.status === "absent") {
    return (
      <Dotted>
        <button
          type="button"
          className="cursor-pointer text-surface-400 underline decoration-dotted underline-offset-2 hover:text-surface-200"
          onClick={() => warm.mutate()}
        >
          {m.workshop_bin_build_index_action()}
        </button>
      </Dotted>
    );
  }

  if (others.length === 0) return null;

  const label = m.workshop_bin_other_declarations_label({ count: others.length });
  return (
    <Dotted>
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
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={8}
          aria-label={label}
          className="w-96 p-1"
        >
          <DeclarationList
            declarations={others}
            objectHash={objectHash}
            objectPath={objectPath}
            layerTitle={title}
          />
        </Popover.Content>
      </Popover.Root>
    </Dotted>
  );
}

/** What the slot draws, after the dot that parts it from the class. */
function Dotted({ children }: { children: ReactNode }) {
  return (
    <>
      <Dot />
      {children}
    </>
  );
}

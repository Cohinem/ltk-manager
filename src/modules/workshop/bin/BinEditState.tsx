import { LockSimpleIcon } from "@phosphor-icons/react";

import { Button, Tooltip, useToast } from "@/components";
import { errorSummary, m, readOnlyDescription } from "@/i18n";
import { api, type AssetRef, type BinDocumentId, type ReadOnly } from "@/lib/tauri";
import { SaveStatus } from "@/modules/editor";

import { assetKey } from "../preview/assetRef";
import { forgetBinSave, retryBinSave, useBinSave } from "../state";
import { useInvalidateBinReads } from "./useBinEdit";

interface BinEditStateProps {
  document: BinDocumentId;
  asset: AssetRef;
  /** The gate the document stands behind, null where it takes edits. */
  readOnly: ReadOnly | null;
  /** Open the document again after a reload replaced its tree. */
  onReload: () => void;
}

/** What a bin tab's toolbar says about editing: the gate it stands behind, or its autosave. */
export function BinEditState({ document, asset, readOnly, onReload }: BinEditStateProps) {
  if (readOnly !== null) return <ReadOnlyMark gate={readOnly} />;
  return <AutosaveStatus document={document} asset={asset} onReload={onReload} />;
}

interface AutosaveStatusProps {
  document: BinDocumentId;
  asset: AssetRef;
  onReload: () => void;
}

function AutosaveStatus({ document, asset, onReload }: AutosaveStatusProps) {
  const key = assetKey(asset);
  const save = useBinSave(key);
  const invalidate = useInvalidateBinReads();
  const toast = useToast();

  function reload() {
    void api.bin.reload(document).then((result) => {
      if (!result.ok) {
        toast.error(m.workshop_bin_reload_failed_title(), errorSummary(result.error));
        return;
      }
      forgetBinSave(key);
      invalidate();
      onReload();
    });
  }

  if (save.state === "failed" && save.error?.code === "BIN_CHANGED_ON_DISK") {
    return (
      <span className="flex shrink-0 items-center gap-1.5">
        <Tooltip content={errorSummary(save.error)}>
          {/* DS-TEXT */}
          <span className="text-[0.6875rem] text-danger-text select-none">
            {m.workshop_bin_changed_on_disk_hint()}
          </span>
        </Tooltip>
        <Button variant="ghost" size="xs" compact onClick={reload}>
          {m.workshop_bin_reload_action()}
        </Button>
      </span>
    );
  }

  return (
    <SaveStatus
      state={save.state}
      blockedHint={m.workshop_bin_refused_hint()}
      onRetry={() => retryBinSave(key)}
    />
  );
}

function ReadOnlyMark({ gate }: { gate: ReadOnly }) {
  return (
    <Tooltip content={readOnlyDescription(gate)}>
      <span className="flex shrink-0 items-center gap-1 text-meta text-surface-400 select-none">
        <LockSimpleIcon className="h-3.5 w-3.5" />
        {m.workshop_bin_read_only_label()}
      </span>
    </Tooltip>
  );
}

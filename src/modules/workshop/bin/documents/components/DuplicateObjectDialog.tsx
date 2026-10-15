import { useState } from "react";

import { Button, Dialog, FormField } from "@/components";
import { errorSummary, m } from "@/i18n";
import {
  type AppError,
  api,
  type AssetRef,
  type BinDocumentId,
  type BinObjectHeader,
} from "@/lib/tauri";

import { objectDocument } from "../../../documents/utils/contentDocument";
import { useOptionalProjectContext } from "../../../projects/state/ProjectContext";
import { useSandbox } from "../../../sandbox/state/SandboxContext";
import { binSaveKey, queueForSave, useOpenDocumentAs } from "../../../state";
import { useInvalidateBinReads } from "../../tree/hooks/useBinEdit";
import { useDocumentCall } from "../hooks/useDocumentCall";

/** The project folder a name starts in where no project is open. */
const NO_MOD = "mod";

export interface DuplicateObjectDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The open the object is read under. */
  readonly document: BinDocumentId;
  readonly asset: AssetRef;
  /** The file the object is declared in, as its tab names it. */
  readonly file: string;
  readonly object: BinObjectHeader;
}

/**
 * The dialog of Duplicate as new object in an object tab: the new object's name, then a copy of
 * the object under it in the same file, opened in its own tab.
 *
 * The name starts as `Mods/<mod>/<the object's last segment>`. A refusal, such as a name the
 * file holds, stays under the name.
 */
export function DuplicateObjectDialog({
  open,
  onClose,
  document,
  asset,
  file,
  object,
}: DuplicateObjectDialogProps) {
  const project = useOptionalProjectContext();
  const suggested = `Mods/${project?.name ?? NO_MOD}/${leafOf(object.name)}`;
  const [name, setName] = useState(suggested);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const call = useDocumentCall(document);
  const saveKey = binSaveKey(useSandbox(), asset);
  const invalidate = useInvalidateBinReads();
  const openAs = useOpenDocumentAs();

  function close() {
    setName(suggested);
    setError(null);
    onClose();
  }

  async function create() {
    if (pending) return;
    setPending(true);
    setError(null);

    const origin = { type: "clone" as const, source: object.entry };
    const { result, id } = await call((id) =>
      api.bin.edit(id, { kind: "object", edit: { kind: "create", name: name.trim(), origin } }),
    );
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    queueForSave(saveKey, id);
    invalidate();
    close();
    if (result.value.kind === "object") {
      const entry = result.value.entry;
      openAs(objectDocument(asset, entry, name.trim(), file, object.class), "default");
    }
  }

  return (
    <Dialog.Shell
      open={open}
      onClose={close}
      title={m.workshop_bin_duplicate_object_action()}
      closable={!pending}
    >
      <Dialog.Body>
        <FormField
          label={m.workshop_bin_new_object_name_label()}
          value={name}
          autoFocus
          spellCheck={false}
          error={error === null ? undefined : errorSummary(error)}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void create();
          }}
        />
      </Dialog.Body>
      <Dialog.Footer>
        <Button variant="ghost" onClick={close} disabled={pending}>
          {m.common_cancel_action()}
        </Button>
        <Button
          variant="filled"
          tone="accent"
          loading={pending}
          disabled={pending || name.trim() === ""}
          onClick={() => void create()}
        >
          {m.workshop_bin_duplicate_object_confirm_action()}
        </Button>
      </Dialog.Footer>
    </Dialog.Shell>
  );
}

/** The last segment of an object's path. */
function leafOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

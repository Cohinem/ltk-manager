import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { use } from "react";

import { useToast } from "@/components";
import { useCopyToClipboard } from "@/hooks";
import { errorSummary, m } from "@/i18n";
import { api, type TemplateEmitter, type ValueEdit } from "@/lib/tauri";

import { useDocumentCall } from "../../documents/hooks/useDocumentCall";
import { LeafEditContext } from "../../tree/hooks/useLeafEdit";
import { RowDocumentContext } from "../../tree/state/rowFold";
import type { SystemModel } from "../engine/model/model";
import { VfxRunContext } from "../playback/state/run";
import { landingEdits } from "../templates/templateEdits";
import {
  COMPLEX_LIST,
  duplicateEdits,
  type EmitterRef,
  emitterPlace,
  isEmitterCopy,
  pasteEdits,
  removeEdits,
} from "./emitterCopy";
import type { EmitterClipboard } from "./emitterKeys";

/** The text the last copy wrote, which a paste reads where the webview grants no clipboard. */
let lastCopy: string | null = null;

/**
 * Duplicate, copy, paste and delete of the open system's emitters, each edit one undo step.
 *
 * The clipboard text is the backend's copy of the emitter, so a paste lands in any system of
 * any open document. A refusal is a toast, as an object row's own edits report theirs.
 * "Duplicating, pasting and deleting an emitter" in docs/ux/BIN_EDITOR.md.
 */
export function useEmitterClipboard(): EmitterClipboard | null {
  const edit = use(LeafEditContext);
  const document = use(RowDocumentContext);
  const call = useDocumentCall(document);
  const toast = useToast();
  const writeClipboard = useCopyToClipboard();
  const system = use(VfxRunContext)?.system ?? null;

  if (document === null) return null;

  const copy = async (emitter: EmitterRef) => {
    const { result } = await call((id) => api.bin.copyValue(id, emitter.entry, emitter.wire));
    if (!result.ok) {
      toast.error(m.workshop_bin_emitter_copy_failed_title(), errorSummary(result.error));
      return;
    }

    lastCopy = result.value;
    await writeClipboard(result.value, m.workshop_bin_emitter_label(), emitter.name);
  };

  const send = edit?.send;
  const landed = edit?.landed;
  if (send === undefined || landed === undefined) {
    return { copy, duplicate: null, paste: null, remove: null, land: null };
  }

  const apply = async (entry: string, list: string, edits: ValueEdit[]) => {
    const { result, id } = await send((id) =>
      api.bin.edit(id, { kind: "editProperty", entry, holder: "", field: list, edits }),
    );
    if (!result.ok) {
      toast.error(m.workshop_bin_emitter_edit_failed_title(), errorSummary(result.error));
      return false;
    }

    landed(id);
    return true;
  };

  const duplicate = async (emitter: EmitterRef) => {
    const place = emitterPlace(emitter.wire);
    if (place === null) return;

    await apply(emitter.entry, place.list, duplicateEdits(place.index));
  };

  const paste = async (entry: string, after: EmitterRef | null) => {
    const text = await readClipboard();
    if (text === null || !isEmitterCopy(text)) {
      toast.error(
        m.workshop_bin_emitter_edit_failed_title(),
        m.workshop_bin_emitter_paste_empty_description(),
      );
      return;
    }

    const place = after === null ? null : emitterPlace(after.wire);
    const list = place?.list ?? COMPLEX_LIST;
    const index = place === null ? null : place.index + 1;
    await apply(entry, list, pasteEdits(text, index));
  };

  const remove = async (emitter: EmitterRef) => {
    const place = emitterPlace(emitter.wire);
    if (place === null) return;

    await apply(emitter.entry, place.list, removeEdits(place.index));
  };

  const land =
    system === null
      ? null
      : async (entry: string, after: EmitterRef | null, emitters: readonly TemplateEmitter[]) => {
          const place = after === null ? null : emitterPlace(after.wire);
          const list = place?.list ?? COMPLEX_LIST;
          const index = place === null ? complexEnd(system) : place.index + 1;
          const taken = new Set(system.emitters.map((emitter) => emitter.name));
          return apply(entry, list, landingEdits(emitters, index, taken));
        };

  return { copy, duplicate, paste, remove, land };
}

/** The index past the last emitter of the system's complex list. */
function complexEnd(system: SystemModel): number {
  return system.emitters
    .filter((emitter) => !emitter.simple)
    .reduce((most, emitter) => Math.max(most, emitter.listIndex + 1), 0);
}

/**
 * The clipboard's text, else the last copy's where the read fails.
 *
 * Read through the backend, since a read of the webview's own asks the user for permission each time.
 */
async function readClipboard(): Promise<string | null> {
  try {
    return await readText();
  } catch {
    return lastCopy;
  }
}

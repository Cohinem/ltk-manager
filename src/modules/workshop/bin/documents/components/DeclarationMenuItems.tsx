import {
  ArrowsMergeIcon,
  ClipboardTextIcon,
  CodeBlockIcon,
  LinkSimpleIcon,
} from "@phosphor-icons/react";
import { use } from "react";

import { ContextMenu, useToast } from "@/components";
import { useCopyToClipboard } from "@/hooks";
import { errorSummary, m } from "@/i18n";
import { api, type BinRow } from "@/lib/tauri";

import { useInvalidateBinReads } from "../../tree/hooks/useBinEdit";
import { RowDocumentContext } from "../../tree/state/rowFold";
import { useCopyDeclaration, useDeclares, useRowDeclaration } from "../hooks/useDeclared";
import { useCopiedReference, useRememberReference } from "../state/copiedReference";

/**
 * A row's declaration and reference actions: Copy as declaration and Copy reference on any
 * bin, and Paste reference and Merge reference on a declared document. "Declaring from a game
 * bin" in docs/ux/BIN_EDITOR.md.
 */
export function DeclarationMenuItems({ row }: { row: BinRow }) {
  const document = use(RowDocumentContext);
  const declares = useDeclares();
  const copy = useCopyToClipboard();
  const remember = useRememberReference();
  const copied = useCopiedReference();
  const invalidate = useInvalidateBinReads();
  const toast = useToast();

  const spelled = useRowDeclaration(document, row.entry, row.path);
  const copyDeclaration = useCopyDeclaration();

  if (document === null || row.node === "record" || row.node === "target") return null;
  /* An object copies as its entry. A reference and a paste name a value, which it is not. */
  const object = row.node === "object";
  const declaration = spelled?.declaration ?? null;
  const reference = spelled?.reference ?? null;
  const merges = row.value.type === "container" || row.value.type === "map";

  function declare(merge: boolean) {
    if (document === null || copied === null) return;
    void api.bin.declareReference(document, row.entry, row.path, copied, merge).then((result) => {
      if (!result.ok) {
        toast.error(m.workshop_bin_reference_failed_title(), errorSummary(result.error));
        return;
      }
      invalidate();
    });
  }

  return (
    <>
      <ContextMenu.Item
        icon={<CodeBlockIcon />}
        disabled={declaration === null}
        title={declaration === null ? m.workshop_bin_copy_declaration_refused_hint() : undefined}
        onClick={() => spelled !== null && copyDeclaration(spelled)}
      >
        {m.workshop_bin_copy_declaration_action()}
      </ContextMenu.Item>
      {!object && (
        <ContextMenu.Item
          icon={<LinkSimpleIcon />}
          disabled={reference === null}
          title={reference === null ? m.workshop_bin_copy_reference_refused_hint() : undefined}
          onClick={() => {
            if (reference === null) return;
            remember(reference);
            void copy(`!ref ${reference}`, m.workshop_bin_reference_label());
          }}
        >
          {m.workshop_bin_copy_reference_action()}
        </ContextMenu.Item>
      )}
      {declares && !object && (
        <ContextMenu.Item
          icon={<ClipboardTextIcon />}
          disabled={copied === null}
          title={copied ?? m.workshop_bin_paste_reference_empty_hint()}
          onClick={() => declare(false)}
        >
          {m.workshop_bin_paste_reference_action()}
        </ContextMenu.Item>
      )}
      {declares && !object && merges && (
        <ContextMenu.Item
          icon={<ArrowsMergeIcon />}
          disabled={copied === null}
          title={copied ?? m.workshop_bin_paste_reference_empty_hint()}
          onClick={() => declare(true)}
        >
          {m.workshop_bin_merge_reference_action()}
        </ContextMenu.Item>
      )}
      <ContextMenu.Separator />
    </>
  );
}

import type { ReactNode } from "react";

import { AlertBox, Button, Dialog } from "@/components";
import { m } from "@/i18n";

/** What a reader answers when a close meets unsaved edits. */
export type UnsavedAnswer = "save" | "discard" | "cancel";

export interface UnsavedCloseDialogProps {
  open: boolean;
  /** What the dialog is called, in its header. */
  title: ReactNode;
  /** What the answers apply to, in the callout. */
  description: ReactNode;
  /** Absent leaves Discard and Cancel alone, for a document nothing can write on demand. */
  saveLabel?: ReactNode;
  discardLabel: ReactNode;
  /** Whether a save is still being written, which spins the save button. */
  saving?: boolean;
  onAnswer: (answer: UnsavedAnswer) => void;
}

/**
 * The question a close with unsaved edits asks.
 *
 * Per "The unsaved-edits question" in `docs/ux/PROJECT_EDITOR.md`. Raised by
 * both a tab's own close and a quit, so the two read alike.
 */
export function UnsavedCloseDialog({
  open,
  title,
  description,
  saveLabel,
  discardLabel,
  saving,
  onAnswer,
}: UnsavedCloseDialogProps) {
  return (
    <Dialog.Shell open={open} onClose={() => onAnswer("cancel")} title={title} size="sm">
      <Dialog.Body>
        <AlertBox variant="warning">{description}</AlertBox>
      </Dialog.Body>

      <Dialog.Footer>
        <Button variant="ghost" onClick={() => onAnswer("cancel")} disabled={saving}>
          {m.editor_unsaved_cancel_action()}
        </Button>
        <Button variant="outline" onClick={() => onAnswer("discard")} disabled={saving}>
          {discardLabel}
        </Button>
        {saveLabel !== undefined && (
          <Button variant="filled" onClick={() => onAnswer("save")} loading={saving}>
            {saveLabel}
          </Button>
        )}
      </Dialog.Footer>
    </Dialog.Shell>
  );
}

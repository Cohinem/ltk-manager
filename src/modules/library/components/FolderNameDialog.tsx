import { Dialog } from "@/components";

import { FolderNameForm } from "./FolderNameForm";

export interface FolderNameDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  /** The name the field opens on, for a rename. */
  initialName?: string;
  isPending: boolean;
  onSubmit: (name: string) => void;
}

/** The dialog that names a library folder, for a new folder or a rename. */
export function FolderNameDialog({
  open,
  onClose,
  title,
  submitLabel,
  initialName,
  isPending,
  onSubmit,
}: FolderNameDialogProps) {
  return (
    <Dialog.Shell open={open} onClose={onClose} title={title} size="sm">
      <Dialog.Body>
        <FolderNameForm
          initialName={initialName}
          submitLabel={submitLabel}
          isPending={isPending}
          onSubmit={onSubmit}
          onCancel={onClose}
        />
      </Dialog.Body>
    </Dialog.Shell>
  );
}

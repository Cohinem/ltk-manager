import { useState } from "react";

import { Button, Field } from "@/components";

interface FolderNameFormProps {
  initialName?: string;
  submitLabel: string;
  isPending?: boolean;
  onSubmit: (name: string) => void;
  onCancel?: () => void;
}

export function FolderNameForm({
  initialName = "",
  submitLabel,
  isPending,
  onSubmit,
  onCancel,
}: FolderNameFormProps) {
  const [name, setName] = useState(initialName);

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      className="flex flex-col gap-2"
    >
      <Field.Control
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Folder name"
        autoFocus
      />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} type="button">
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={!name.trim() || isPending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

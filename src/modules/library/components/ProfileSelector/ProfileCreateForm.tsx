import { CheckIcon, XIcon } from "@phosphor-icons/react";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button, Field, IconButton, useToast } from "@/components";
import { useCreateProfile } from "@/modules/library/api";

export function ProfileCreateForm() {
  const createProfile = useCreateProfile();
  const toast = useToast();

  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCreating) {
      inputRef.current?.focus();
    }
  }, [isCreating]);

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || createProfile.isPending) return;

    try {
      await createProfile.mutateAsync(trimmedName);
      setName("");
      setIsCreating(false);
      toast.success("Profile created", `Profile "${trimmedName}" has been created.`);
    } catch {
      /* The default mutation toast reports it. */
    }
  };

  const handleCancel = () => {
    setIsCreating(false);
    setName("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  if (!isCreating) {
    return (
      <Button
        variant="ghost"
        onClick={() => setIsCreating(true)}
        left={<Plus className="size-4" />}
        className="w-full justify-start"
      >
        New Profile
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1 p-1">
      <Field.Control
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        size="sm"
        className="flex-1"
        placeholder="Profile name..."
      />
      <IconButton
        size="sm"
        icon={<CheckIcon />}
        tone="accent"
        onClick={handleSubmit}
        disabled={!name.trim() || createProfile.isPending}
        loading={createProfile.isPending}
      />
      <IconButton size="sm" icon={<XIcon />} onClick={handleCancel} />
    </div>
  );
}

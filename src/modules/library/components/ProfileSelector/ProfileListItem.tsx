import { Check, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button, Field, IconButton, useToast } from "@/components";
import type { Profile } from "@/lib/tauri";
import { useRenameProfile } from "@/modules/library/api";

interface ProfileListItemProps {
  profile: Profile;
  isActive: boolean;
  onSwitch: (profileId: string) => void;
  onDeleteClick: (profile: Profile) => void;
  isSwitching: boolean;
}

export function ProfileListItem({
  profile,
  isActive,
  onSwitch,
  onDeleteClick,
  isSwitching,
}: ProfileListItemProps) {
  const renameProfile = useRenameProfile();
  const toast = useToast();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const isDefaultProfile = profile.name === "Default";

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
    }
  }, [isEditing]);

  const startEditing = () => {
    setIsEditing(true);
    setEditName(profile.name);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditName("");
  };

  const handleRename = async () => {
    const trimmedName = editName.trim();
    if (!trimmedName || renameProfile.isPending) return;

    try {
      await renameProfile.mutateAsync({ profileId: profile.id, newName: trimmedName });
      setIsEditing(false);
      setEditName("");
      toast.success("Profile renamed");
    } catch {
      /* The default mutation toast reports it. */
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRename();
    } else if (e.key === "Escape") {
      cancelEditing();
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-1 p-1">
        <Field.Control
          ref={inputRef}
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-7 flex-1 px-2 py-1 text-sm"
          placeholder="Profile name..."
        />
        <IconButton
          compact={false}
          icon={<Check className="size-4" />}
          onClick={handleRename}
          disabled={!editName.trim() || renameProfile.isPending}
          className="text-success-text hover:text-success-text"
        />
        <IconButton compact={false} icon={<X className="size-4" />} onClick={cancelEditing} />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onSwitch(profile.id)}
        disabled={isSwitching || isActive}
        className="flex-1 justify-between"
        right={isActive ? <Check className="size-4 text-accent-500" /> : undefined}
      >
        {profile.name}
      </Button>

      {!isDefaultProfile && (
        <>
          <IconButton
            compact={false}
            icon={<Pencil className="size-3.5" />}
            onClick={startEditing}
            tooltip="Rename profile"
          />
          <IconButton
            compact={false}
            icon={<Trash2 className="size-3.5" />}
            onClick={() => onDeleteClick(profile)}
            disabled={isActive}
            className="hover:text-danger-text"
            tooltip="Delete profile"
          />
        </>
      )}
    </div>
  );
}

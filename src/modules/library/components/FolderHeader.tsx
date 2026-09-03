import { Link } from "@tanstack/react-router";
import { ArrowLeft, FolderOpen } from "lucide-react";

import { Checkbox, IconButton } from "@/components";
import type { InstalledMod, LibraryFolder } from "@/lib/tauri";
import { useFolderToggle } from "@/modules/library/api";

interface FolderHeaderProps {
  folder: LibraryFolder;
  mods: InstalledMod[];
}

export function FolderHeader({ folder, mods }: FolderHeaderProps) {
  const { handleToggle, checked, indeterminate } = useFolderToggle(folder, mods);

  return (
    <div className="flex items-center gap-3">
      <Link to="/mods">
        <IconButton
          icon={<ArrowLeft />}
          variant="ghost"
          size="sm"
          aria-label="Back to all folders"
        />
      </Link>
      <FolderOpen className="h-5 w-5 text-accent-400" />
      <h2 className="text-lg font-semibold text-surface-100">{folder.name}</h2>
      <span className="text-sm text-surface-500">
        {mods.length} {mods.length === 1 ? "mod" : "mods"}
      </span>
      {mods.length > 0 && (
        <Checkbox
          checked={checked}
          indeterminate={indeterminate}
          onCheckedChange={handleToggle}
          size="sm"
        />
      )}
    </div>
  );
}

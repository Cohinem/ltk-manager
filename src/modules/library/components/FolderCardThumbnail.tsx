import type { InstalledMod } from "@/lib/tauri";
import { useModThumbnail } from "@/modules/library/api/useModThumbnail";

interface FolderCardThumbnailProps {
  mod: InstalledMod;
}

export function FolderCardThumbnail({ mod }: FolderCardThumbnailProps) {
  const { data: thumbnailUrl } = useModThumbnail(mod.id);

  if (thumbnailUrl) {
    return <img src={thumbnailUrl} alt="" className="size-full object-cover" />;
  }

  return (
    <div className="flex size-full items-center justify-center bg-surface-800">
      <span className="text-lg font-bold text-surface-500">
        {mod.displayName.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

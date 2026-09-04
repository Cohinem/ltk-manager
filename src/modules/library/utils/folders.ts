import type { InstalledMod } from "@/lib/tauri";

export interface ToggleMessage {
  title: string;
  description: string;
}

export function formatToggleMessage(
  enabled: boolean,
  count: number,
  folderName: string,
): ToggleMessage {
  const action = enabled ? "Enabled" : "Disabled";
  return {
    title: `${action} ${count} mod${count !== 1 ? "s" : ""}`,
    description: `All mods in "${folderName}" have been ${enabled ? "enabled" : "disabled"}`,
  };
}

export interface FolderEnabledState {
  enabledCount: number;
  checked: boolean;
  indeterminate: boolean;
}

export function getFolderEnabledState(mods: InstalledMod[]): FolderEnabledState {
  const enabledCount = mods.filter((m) => m.enabled).length;
  if (mods.length === 0) return { enabledCount: 0, checked: false, indeterminate: false };
  if (enabledCount === mods.length) return { enabledCount, checked: true, indeterminate: false };
  if (enabledCount > 0) return { enabledCount, checked: false, indeterminate: true };
  return { enabledCount: 0, checked: false, indeterminate: false };
}

export function getFolderSummary(mods: InstalledMod[]): string {
  const champs = new Set<string>();
  const tags = new Set<string>();
  for (const m of mods) {
    for (const c of m.champions) champs.add(c);
    for (const t of m.tags) tags.add(t);
  }
  const parts: string[] = [];
  if (champs.size > 0) parts.push(`${champs.size} champ${champs.size !== 1 ? "s" : ""}`);
  if (tags.size > 0) parts.push(`${tags.size} tag${tags.size !== 1 ? "s" : ""}`);
  return parts.join(" · ");
}

/**
 * `mods` with `modId` moved to the front of its folder's run.
 *
 * Mirrors what enabling a mod does on the backend, so the card moves under the
 * pointer rather than jumping once the refetch lands. The cached list is the
 * profile's mod order, which groups each folder's mods together.
 */
export function promoteToFolderFront(mods: InstalledMod[], modId: string): InstalledMod[] {
  const from = mods.findIndex((mod) => mod.id === modId);
  if (from === -1) return mods;

  const folderId = mods[from].folderId ?? null;
  const to = mods.findIndex((mod) => (mod.folderId ?? null) === folderId);
  if (to === -1 || to === from) return mods;

  const next = [...mods];
  const [promoted] = next.splice(from, 1);
  next.splice(to, 0, promoted);
  return next;
}

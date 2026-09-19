import type { Settings } from "@/lib/tauri";

/** Whether any built-in mod is on, which gives the patcher something to apply. */
export function hasBuiltinMods(settings: Settings | undefined): boolean {
  return Object.values(settings?.builtinMods ?? {}).some(Boolean);
}

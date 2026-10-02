import type { InstalledMod_Serialize } from "@/lib/bindings";
import { commands } from "@/lib/ipc/library";
import type { Result } from "@/utils/result";

/**
 * The Native tab's one IPC binding, kept here rather than in `@/lib/tauri` so
 * that file stays identical to upstream.
 */
export async function applyLeagueSkin(
  championId: number,
  skinId: number,
  chromaId?: number | null,
): Promise<Result<InstalledMod_Serialize>> {
  const response = await commands.applyLeagueSkin(championId, skinId, chromaId ?? null);
  return response.ok ? { ok: true, value: response.value } : { ok: false, error: response.error };
}

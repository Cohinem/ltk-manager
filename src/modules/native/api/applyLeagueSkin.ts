import { invoke } from "@tauri-apps/api/core";

import type { AppError, InstalledMod } from "@/lib/bindings";
import type { Result } from "@/utils/result";

/**
 * The Native tab's one IPC binding, kept here rather than in `@/lib/tauri` so
 * that file stays identical to upstream.
 */
export async function applyLeagueSkin(
  championId: number,
  skinId: number,
  chromaId?: number | null,
): Promise<Result<InstalledMod>> {
  const response = await invoke<{ ok: true; value: InstalledMod } | { ok: false; error: AppError }>(
    "apply_league_skin",
    {
      championId,
      skinId,
      chromaId: chromaId ?? null,
    },
  );
  return response.ok ? { ok: true, value: response.value } : { ok: false, error: response.error };
}

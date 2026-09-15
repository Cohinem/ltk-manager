import { queryOptions } from "@tanstack/react-query";

import {
  api,
  type AppError,
  type BinDocumentId,
  type CharacterSpells,
  type CharacterSpell,
  type AssetRef,
  type DeclaredObjects,
  type SpellPreview,
} from "@/lib/tauri";
import { queryFnWithArgs } from "@/utils/query";

import { BUILDING_POLL_MS, gameKeys } from "../../../gameBrowser/api/keys";
import { assetKey } from "../../../preview/utils/assetRef";
import { compileFlight } from "../utils/flight";

export type SpellAvailability = "supported" | "unsupported" | "ambiguous" | "unavailable";

async function availability(
  spells: readonly CharacterSpell[],
  signal: AbortSignal,
  impacts: boolean,
) {
  const result: Record<string, SpellAvailability> = {};
  const files = new Map<string, { asset: AssetRef; spells: CharacterSpell[] }>();
  for (const spell of spells) {
    if (spell.declarations.length !== 1) {
      result[spell.objectHash] = "ambiguous";
      continue;
    }
    const asset = spell.declarations[0].asset;
    const key = assetKey(asset);
    const file = files.get(key) ?? { asset, spells: [] };
    file.spells.push(spell);
    files.set(key, file);
  }
  for (const file of files.values()) {
    signal.throwIfAborted();
    const opened = await api.bin.open(file.asset, null);
    if (!opened.ok) {
      for (const spell of file.spells) result[spell.objectHash] = "unavailable";
      continue;
    }
    const document = opened.value.document;
    try {
      for (const spell of file.spells) {
        signal.throwIfAborted();
        const read = await api.bin.readSpell(document, spell.objectHash);
        if (!read.ok) result[spell.objectHash] = "unavailable";
        else {
          const preview = read.value;
          const supported =
            (impacts &&
              preview.haveHitEffect !== false &&
              Boolean(preview.hitEffectKey || preview.hitEffectName?.trim())) ||
            (typeof preview.animationName === "string" && preview.animationName.trim() !== "") ||
            (preview.missile !== null &&
              !preview.issues.some((issue) => issue.kind === "invalid") &&
              compileFlight(preview.missile, [-400, 100, 0], [400, 100, 0]) !== null);
          result[spell.objectHash] = supported ? "supported" : "unsupported";
        }
      }
    } finally {
      await api.bin.close(document);
    }
  }
  return result;
}

export const spellQueries = {
  availability: (spells: readonly CharacterSpell[], impacts = false) =>
    queryOptions({
      queryKey: ["spell", "availability", spells, impacts],
      queryFn: ({ signal }) => availability(spells, signal, impacts),
      staleTime: Infinity,
      retry: false,
      enabled: spells.length > 0,
    }),
  effects: (document: BinDocumentId, hashes: readonly string[]) =>
    queryOptions<DeclaredObjects, AppError>({
      queryKey: ["spell-effects", document, hashes],
      queryFn: queryFnWithArgs(api.objects.declared, hashes, document),
      staleTime: Infinity,
      retry: false,
      enabled: hashes.length > 0,
    }),
  preview: (document: BinDocumentId, entry: string) =>
    queryOptions<SpellPreview, AppError>({
      queryKey: ["spell", document, entry],
      queryFn: queryFnWithArgs(api.bin.readSpell, document, entry),
      staleTime: Infinity,
      retry: false,
    }),
  catalog: (character: string) =>
    queryOptions<CharacterSpells, AppError>({
      queryKey: [...gameKeys.objectSearches, "spells", character.toLowerCase()],
      queryFn: queryFnWithArgs(api.objects.spells, character),
      staleTime: Infinity,
      retry: false,
      refetchInterval: ({ state }) =>
        state.data?.status === "building" ? BUILDING_POLL_MS : false,
    }),
};

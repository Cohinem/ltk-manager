import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { AssetRef } from "@/lib/tauri";
import { keepUnversioned, localJsonStorage } from "@/stores/storage";

import { assetKey } from "../../preview/utils/assetRef";

interface VoiceSkinStore {
  /** The skin bin that each object's names resolve as, by object hash. */
  readonly skins: Readonly<Record<string, string>>;
  readonly choose: (object: string, bin: string) => void;
}

/** The skin that the Voice lines view of each object resolves its names as, per user. */
export const useVoiceSkinStore = create<VoiceSkinStore>()(
  persist(
    (set) => ({
      skins: {},
      choose: (object, bin) => set((state) => ({ skins: { ...state.skins, [object]: bin } })),
    }),
    {
      name: "audio-voice-skins",
      version: 1,
      migrate: keepUnversioned<VoiceSkinStore>,
      storage: localJsonStorage,
    },
  ),
);

/** The skin bin that the reader chose for the object `object`, or null. */
export function useVoiceSkin(object: string): string | null {
  return useVoiceSkinStore((state) => state.skins[object] ?? null);
}

/** Remembers the skin bin that the names of an object resolve as. */
export function useChooseVoiceSkin(): (object: string, bin: string) => void {
  return useVoiceSkinStore((state) => state.choose);
}

/** A request to select one rule of the Voice lines view of one object. */
export interface RuleFocusRequest {
  /** The object hash, `0x` and eight hex digits. */
  readonly object: string;
  /** The rule's hash path from the object's root. */
  readonly path: string;
  /** Distinct per request, so a second request for the same rule still lands. */
  readonly serial: number;
}

interface RuleFocusStore {
  readonly request: RuleFocusRequest | null;
  readonly focus: (object: string, path: string) => void;
}

/**
 * The rule that a bank's Played by cell asks the Voice lines view of an object to select.
 *
 * The bank opens the object tab and writes the request, and the view reads it, so neither knows
 * the other's tab, as `mediaFocus` does for a media row.
 */
export const useRuleFocusStore = create<RuleFocusStore>((set) => ({
  request: null,
  focus: (object, path) =>
    set((state) => ({ request: { object, path, serial: (state.request?.serial ?? 0) + 1 } })),
}));

/** The request that targets `object`, or null. */
export function useRuleFocus(object: string): RuleFocusRequest | null {
  return useRuleFocusStore((state) => (state.request?.object === object ? state.request : null));
}

/** Asks the Voice lines view of `object` to select the rule at `path`. */
export function useFocusRule(): (object: string, path: string) => void {
  return useRuleFocusStore((state) => state.focus);
}

/** What the Voice lines view asks an event bank document to do with one event. */
export type BankEventIntent =
  | { readonly kind: "show"; readonly event: number }
  | { readonly kind: "create"; readonly name: string };

/** A request to one event bank document, by the `assetKey` of its bank. */
export interface BankEventRequest {
  readonly asset: string;
  readonly intent: BankEventIntent;
  readonly serial: number;
}

interface BankEventStore {
  readonly request: BankEventRequest | null;
  readonly ask: (asset: AssetRef, intent: BankEventIntent) => void;
  readonly settle: (serial: number) => void;
}

/**
 * The event that a rule row asks an event bank document to show, or the name it asks it to
 * create an event under.
 *
 * The view opens the bank's document and writes the request, and the document's Events view
 * answers it once.
 */
export const useBankEventStore = create<BankEventStore>((set) => ({
  request: null,
  ask: (asset, intent) =>
    set((state) => ({
      request: { asset: assetKey(asset), intent, serial: (state.request?.serial ?? 0) + 1 },
    })),
  settle: (serial) =>
    set((state) => (state.request?.serial === serial ? { request: null } : state)),
}));

/** The request that targets the bank `asset`, or null. */
export function useBankEventRequest(asset: AssetRef): BankEventRequest | null {
  const key = assetKey(asset);
  return useBankEventStore((state) => (state.request?.asset === key ? state.request : null));
}

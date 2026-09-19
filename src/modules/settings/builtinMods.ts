import { m } from "@/i18n";
import type { BaseSkinsScope, Settings } from "@/lib/tauri";

/** Whether a built-in mod is on that gives the patcher something to apply by itself. */
export function hasBuiltinMods(settings: Settings | undefined): boolean {
  const builtinMods = settings?.builtinMods;
  return builtinMods?.defaultWardSkins === true || builtinMods?.baseSkins === "allChampions";
}

/** Each base skins scope with its label, in the order the picker lists them. */
export function baseSkinsOptions(): { value: BaseSkinsScope; label: string }[] {
  return [
    { value: "off", label: m.settings_patching_base_skins_off() },
    { value: "moddedChampions", label: m.settings_patching_base_skins_modded() },
    { value: "allChampions", label: m.settings_patching_base_skins_all() },
  ];
}

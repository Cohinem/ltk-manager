import type { BuiltinModSettings, Settings } from "@/lib/tauri";
import type { AppearanceKey, ProjectEditorKey } from "@/stores";

/** A setting the backend stores, or one a frontend store owns. */
export type SettingKey =
  | keyof Settings
  | `builtinMods.${keyof BuiltinModSettings}`
  | `display.${AppearanceKey}`
  | `layout.${ProjectEditorKey}`;

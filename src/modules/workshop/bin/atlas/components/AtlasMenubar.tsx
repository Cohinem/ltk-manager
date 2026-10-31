import { m } from "@/i18n";

import { ClassMenubar, type ExtraKey } from "../../menus/components/ClassMenubar";
import { useObjectMenus } from "../../menus/hooks/useObjectMenus";
import { CANVAS_KEYS, SPRITE_KEYS } from "../canvas/canvasKeys";
import { useFontPreviewMenu } from "../hooks/useAtlasCanvasMenu";
import { useAtlasMenus } from "../hooks/useAtlasMenus";

/** The menu bar of a UI view. "Menu bar" in docs/plans/atlas-ui-editor.md. */
export function AtlasMenubar() {
  const menus = useAtlasMenus("atlas");
  const extraKeys: readonly ExtraKey[] = [
    ...canvasGestures(),
    { keys: SPRITE_KEYS.export, title: m.workshop_bin_menu_atlas_export_key_label() },
  ];

  return <ClassMenubar menus={menus} extraKeys={extraKeys} />;
}

/** The menu bar of a UI element, a UI view's bar without what acts on the whole view. */
export function ElementMenubar() {
  const menus = useAtlasMenus("element");

  return <ClassMenubar menus={menus} extraKeys={canvasGestures()} />;
}

/** The menu bar of a `GameFontDescription`. */
export function FontMenubar() {
  const base = useObjectMenus();
  const preview = useFontPreviewMenu();

  return <ClassMenubar menus={[base.file(), base.edit(), base.view(), preview]} />;
}

function canvasGestures(): readonly ExtraKey[] {
  return [
    { keys: CANVAS_KEYS.pan, title: m.workshop_bin_atlas_pan_label() },
    { keys: CANVAS_KEYS.nudgeFar, title: m.workshop_bin_atlas_nudge_far_label() },
  ];
}

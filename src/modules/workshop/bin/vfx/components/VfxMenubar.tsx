import { m } from "@/i18n";
import type { CommandMenu } from "@/modules/editor";

import { ClassMenubar, type ExtraKey } from "../../menus/components/ClassMenubar";
import { useObjectMenus } from "../../menus/hooks/useObjectMenus";
import { useMenuScope, useRunCommands } from "../menus/menuItems";
import { useCurveMenu } from "../menus/useCurveMenu";
import { useEditExtras } from "../menus/useEditExtras";
import { useEmitterMenu } from "../menus/useEmitterMenu";
import { useGraphMenu } from "../menus/useGraphMenu";
import { useInsertMenu } from "../menus/useInsertMenu";
import { usePlaybackMenu } from "../menus/usePlaybackMenu";
import { useViewExtras } from "../menus/useViewExtras";
import { vfxShortcut } from "../utils/vfxKeys";

/**
 * The menu bar of a particle system: File, Edit, Insert, View, Playback, Emitter, Graph, Curve.
 * "Menu bar" in docs/ux/VFX_GRAPH.md.
 *
 * A class without a run lists neither Playback nor Emitter.
 */
export function VfxMenubar() {
  const base = useObjectMenus();
  const scope = useMenuScope();
  const commands = useRunCommands(scope);

  const editExtras = useEditExtras(scope);
  const insert = useInsertMenu(scope);
  const viewExtras = useViewExtras(scope, commands);
  const playback = usePlaybackMenu(scope, commands);
  const emitter = useEmitterMenu(scope, commands);
  const graph = useGraphMenu(scope);
  const curve = useCurveMenu(scope);

  const menus: CommandMenu[] = [
    base.file(),
    base.edit(editExtras),
    insert,
    base.view(viewExtras),
    ...(scope.run === null ? [] : [playback, emitter]),
    graph,
    curve,
  ];

  const extraKeys: readonly ExtraKey[] = [
    { keys: vfxShortcut("quickAddAlternate"), title: m.workshop_bin_menu_vfx_quick_add_action() },
  ];

  return <ClassMenubar menus={menus} extraKeys={extraKeys} />;
}

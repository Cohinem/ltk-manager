import {
  AlignLeftIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowSquareOutIcon,
  ArrowsInIcon,
  ArrowsOutCardinalIcon,
  ArrowUpIcon,
  ChecksIcon,
  ColumnsIcon,
  CopyIcon,
  CornersOutIcon,
  ExportIcon,
  EyeSlashIcon,
  FrameCornersIcon,
  ImageSquareIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  NumberSquareOneIcon,
  PathIcon,
  ProhibitIcon,
  RowsIcon,
  SelectionSlashIcon,
  SquaresFourIcon,
  StackIcon,
  StackSimpleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { lazy, use } from "react";

import { m } from "@/i18n";
import type {
  CommandMenu,
  CommandMenuCommand,
  CommandMenuEntry,
  CommandMenuSubmenu,
} from "@/modules/editor";

import { useObjectMenus } from "../../menus/hooks/useObjectMenus";
import { ObjectMenuContext } from "../../menus/state/objectMenu";
import { usePaneCommandLookup } from "../../menus/state/paneCommands";
import { ALIGNMENTS, LAYER_STEPS } from "../canvas/arrangeTables";
import { CANVAS_BINDINGS, CANVAS_KEYS, SPRITE_KEYS } from "../canvas/canvasKeys";
import { CATEGORY_TITLE, kindGlyph } from "../components/kindGlyphs";
import { classAlias } from "../engine/model/classNames";
import { ELEMENT_KINDS, KIND_CATEGORIES } from "../engine/model/elementKinds";
import { useAtlasEdit } from "../state/atlasEdit";
import {
  useAtlasPreviewActions,
  useAtlasPreviewStore,
  useViewSelection,
  viewKey,
} from "../state/atlasPreview";
import { usePlacing, usePlacingActions } from "../state/placing";
import { alignCommand, arrangeCommand, ATLAS_COMMANDS } from "../utils/atlasCommands";
import { objectBlockReason } from "../utils/atlasReasons";
import { gated, listedRows, MENU_ICON, offered, slotSubmenu } from "./atlasMenuItems";
import { useAtlasCanvasMenu } from "./useAtlasCanvasMenu";
import { useObjectBlock } from "./useObjectBlock";

const SceneFrameItems = lazy(() =>
  import("../components/AtlasBarItems").then((module) => ({ default: module.SceneFrameItems })),
);

/** The class of Atlas view that a bar serves. */
export type AtlasBarKind = "atlas" | "element";

/** Returns the Insert menu: the kinds of the components pane, and letting go of the one placed. */
function useInsertMenu(view: string, inLayout: boolean, layoutReason: string): CommandMenu {
  const edit = useAtlasEdit();
  const gate = useObjectBlock(view);
  const placing = usePlacing(view);
  const { start, stop } = usePlacingActions();
  const interact = useAtlasPreviewStore((state) => state.interact);

  let blocked = objectBlockReason(gate, edit);
  if (interact) blocked = m.workshop_bin_menu_atlas_transform_reason();
  if (!inLayout) blocked = layoutReason;

  return {
    id: "insert",
    title: m.workshop_bin_menu_insert_label(),
    className: "w-56",
    items: [
      ...KIND_CATEGORIES.map((category): CommandMenuSubmenu => ({
        kind: "submenu",
        id: `atlas.insert.${category}`,
        title: CATEGORY_TITLE[category](),
        className: "w-64",
        items: ELEMENT_KINDS.filter((each) => each.category === category).map(
          (each): CommandMenuCommand => {
            const Glyph = kindGlyph(each.class);

            return {
              kind: "command",
              id: `atlas.insert.${each.class}`,
              title: classAlias(each.class),
              icon: <Glyph className={MENU_ICON} />,
              run:
                blocked === undefined
                  ? () => start({ view, kind: each.class, dragged: false })
                  : null,
              reason: blocked,
            };
          },
        ),
      })),
      { kind: "separator" },
      {
        kind: "command",
        id: "atlas.insert.cancel",
        title: m.workshop_bin_menu_atlas_cancel_placing_action(),
        icon: <ProhibitIcon className={MENU_ICON} />,
        shortcut: CANVAS_KEYS.clear,
        run: placing === null ? null : stop,
        reason: m.workshop_bin_menu_atlas_cancel_placing_reason(),
      },
    ],
  };
}

/**
 * Returns the menus of a UI view's or a UI element's bar, per "Menu bar" in
 * docs/plans/atlas-ui-editor.md.
 *
 * An item reads the offer of the canvas or the focused pane, so a closed bar reads no tree.
 */
export function useAtlasMenus(kind: AtlasBarKind): readonly CommandMenu[] {
  const base = useObjectMenus();
  const objectMenu = use(ObjectMenuContext);
  const lookup = usePaneCommandLookup();

  const document = objectMenu?.document ?? 0;
  const entry = objectMenu?.object.entry ?? "";
  const view = viewKey(document, entry);
  const selection = useViewSelection(view);
  const { select } = useAtlasPreviewActions();

  const inLayout = objectMenu?.mode === "layout";
  const layoutReason = m.workshop_bin_menu_atlas_layout_reason({
    layout: objectMenu?.layoutTitle ?? "",
  });
  const atlas = kind === "atlas";
  const canvasMenu = useAtlasCanvasMenu(atlas, document, entry);
  const insertMenu = useInsertMenu(view, inLayout, layoutReason);

  const inView = (command: CommandMenuCommand) => gated(command, inLayout, layoutReason);

  const fileExtras: CommandMenuEntry[] = atlas
    ? [
        offered(
          lookup,
          ATLAS_COMMANDS.spriteExport,
          m.workshop_bin_atlas_sprites_export_action(),
          ExportIcon,
        ),
        offered(
          lookup,
          ATLAS_COMMANDS.spriteReplace,
          m.workshop_bin_atlas_sprites_replace_action(),
          ImageSquareIcon,
          { shortcut: SPRITE_KEYS.replace, absent: m.workshop_bin_menu_atlas_sprite_reason() },
        ),
      ]
    : [];

  const nudge: CommandMenuSubmenu = {
    kind: "submenu",
    id: "atlas.nudge",
    title: m.workshop_bin_menu_atlas_nudge_label(),
    icon: <ArrowsOutCardinalIcon className={MENU_ICON} />,
    className: "w-48",
    items: [
      offered(
        lookup,
        ATLAS_COMMANDS.nudgeLeft,
        m.workshop_bin_menu_atlas_nudge_left_action(),
        ArrowLeftIcon,
        { shortcut: CANVAS_BINDINGS.nudgeLeft.shown },
      ),
      offered(
        lookup,
        ATLAS_COMMANDS.nudgeRight,
        m.workshop_bin_menu_atlas_nudge_right_action(),
        ArrowRightIcon,
        { shortcut: CANVAS_BINDINGS.nudgeRight.shown },
      ),
      offered(
        lookup,
        ATLAS_COMMANDS.nudgeUp,
        m.workshop_bin_menu_atlas_nudge_up_action(),
        ArrowUpIcon,
        { shortcut: CANVAS_BINDINGS.nudgeUp.shown },
      ),
      offered(
        lookup,
        ATLAS_COMMANDS.nudgeDown,
        m.workshop_bin_menu_atlas_nudge_down_action(),
        ArrowDownIcon,
        { shortcut: CANVAS_BINDINGS.nudgeDown.shown },
      ),
    ],
  };

  const editExtras: CommandMenuEntry[] = [
    atlas &&
      offered(lookup, ATLAS_COMMANDS.delete, m.workshop_bin_atlas_delete_action(), TrashIcon, {
        shortcut: CANVAS_KEYS.delete,
        danger: true,
      }),
    nudge,
    { kind: "separator" },
    offered(
      lookup,
      ATLAS_COMMANDS.selectAll,
      m.workshop_bin_menu_atlas_select_all_action(),
      ChecksIcon,
      { shortcut: CANVAS_KEYS.selectAll },
    ),
    {
      kind: "command",
      id: "atlas.selectNone",
      title: m.workshop_bin_atlas_clear_selection_action(),
      icon: <SelectionSlashIcon className={MENU_ICON} />,
      shortcut: CANVAS_KEYS.clear,
      run: selection.length === 0 ? null : () => select(view, null),
      reason: m.workshop_bin_menu_atlas_selection_reason(),
    },
    offered(
      lookup,
      ATLAS_COMMANDS.selectGroup,
      m.workshop_bin_atlas_select_group_action(),
      SquaresFourIcon,
    ),
    {
      kind: "submenu",
      id: ATLAS_COMMANDS.selectLayer,
      title: m.workshop_bin_atlas_select_layer_label(),
      icon: <StackSimpleIcon className={MENU_ICON} />,
      className: "max-h-80 w-64 overflow-y-auto scrollbar-md",
      items: listedRows(
        lookup,
        ATLAS_COMMANDS.selectLayer,
        m.workshop_bin_atlas_select_layer_label(),
      ),
    },
    { kind: "separator" },
    offered(
      lookup,
      ATLAS_COMMANDS.copyName,
      m.workshop_bin_menu_atlas_copy_name_action(),
      CopyIcon,
    ),
    offered(
      lookup,
      ATLAS_COMMANDS.copyPath,
      m.workshop_bin_menu_atlas_copy_path_action(),
      PathIcon,
    ),
    offered(
      lookup,
      ATLAS_COMMANDS.openObject,
      m.workshop_bin_open_object_action(),
      ArrowSquareOutIcon,
    ),
    offered(
      lookup,
      ATLAS_COMMANDS.openBeside,
      m.workshop_bin_open_object_beside_action(),
      ArrowSquareOutIcon,
    ),
  ];

  const sceneFrames = slotSubmenu(
    ATLAS_COMMANDS.sceneFrames,
    m.workshop_bin_menu_atlas_scene_frames_label(),
    FrameCornersIcon,
    <SceneFrameItems document={document} entry={entry} />,
  );
  const hideScene = offered(
    lookup,
    ATLAS_COMMANDS.hideScene,
    m.workshop_bin_menu_atlas_hide_scene_action(),
    EyeSlashIcon,
  );

  const viewExtras: CommandMenuEntry[] = [
    inView(
      offered(lookup, ATLAS_COMMANDS.fit, m.workshop_preview_zoom_fit_label(), ArrowsInIcon, {
        shortcut: CANVAS_KEYS.fit,
      }),
    ),
    inView(
      offered(
        lookup,
        ATLAS_COMMANDS.actual,
        m.workshop_preview_zoom_actual_label(),
        NumberSquareOneIcon,
        { shortcut: CANVAS_KEYS.actual },
      ),
    ),
    inView(
      offered(
        lookup,
        ATLAS_COMMANDS.zoomIn,
        m.workshop_preview_zoom_in_label(),
        MagnifyingGlassPlusIcon,
        { shortcut: CANVAS_KEYS.zoomIn },
      ),
    ),
    inView(
      offered(
        lookup,
        ATLAS_COMMANDS.zoomOut,
        m.workshop_preview_zoom_out_label(),
        MagnifyingGlassMinusIcon,
        { shortcut: CANVAS_KEYS.zoomOut },
      ),
    ),
    inView(
      offered(lookup, ATLAS_COMMANDS.frame, m.workshop_bin_atlas_frame_action(), CornersOutIcon, {
        shortcut: CANVAS_KEYS.frame,
      }),
    ),
    { kind: "separator" },
    offered(
      lookup,
      ATLAS_COMMANDS.hideElement,
      m.workshop_bin_atlas_element_hide_action(),
      EyeSlashIcon,
    ),
    atlas && hideScene,
    atlas && sceneFrames,
  ];

  const arrangeMenu: CommandMenu = {
    id: "arrange",
    title: m.workshop_bin_atlas_arrange_label(),
    className: "w-64",
    items: [
      ...LAYER_STEPS.map(({ step, Glyph, label, shortcut }) =>
        offered(lookup, arrangeCommand(step), label(), Glyph, { shortcut }),
      ),
      { kind: "separator" },
      {
        kind: "submenu",
        id: ATLAS_COMMANDS.moveScene,
        title: m.workshop_bin_atlas_move_scene_label(),
        icon: <StackIcon className={MENU_ICON} />,
        className: "max-h-80 w-60 overflow-y-auto scrollbar-md",
        items: listedRows(
          lookup,
          ATLAS_COMMANDS.moveScene,
          m.workshop_bin_atlas_move_scene_label(),
        ),
      },
      {
        kind: "submenu",
        id: "atlas.align",
        title: m.workshop_bin_atlas_align_label(),
        icon: <AlignLeftIcon className={MENU_ICON} />,
        className: "w-56",
        items: ALIGNMENTS.map(({ how, Glyph, label }) =>
          offered(lookup, alignCommand(how), label(), Glyph),
        ),
      },
      offered(
        lookup,
        ATLAS_COMMANDS.distributeHorizontal,
        m.workshop_bin_atlas_distribute_horizontal_action(),
        ColumnsIcon,
      ),
      offered(
        lookup,
        ATLAS_COMMANDS.distributeVertical,
        m.workshop_bin_atlas_distribute_vertical_action(),
        RowsIcon,
      ),
    ],
  };

  return [
    base.file(fileExtras),
    base.edit(editExtras),
    ...(atlas ? [insertMenu] : []),
    base.view(viewExtras),
    canvasMenu,
    arrangeMenu,
  ];
}

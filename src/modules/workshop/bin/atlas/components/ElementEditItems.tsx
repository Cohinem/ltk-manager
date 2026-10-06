import {
  AlignBottomIcon,
  AlignCenterHorizontalIcon,
  AlignCenterVerticalIcon,
  AlignLeftIcon,
  AlignRightIcon,
  AlignTopIcon,
  ArrowDownIcon,
  ArrowLineDownIcon,
  ArrowLineUpIcon,
  ArrowUpIcon,
  ColumnsIcon,
  RowsIcon,
  StackIcon,
  StackSimpleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { ContextMenu } from "@/components";
import { m } from "@/i18n";
import type { PropertyEdit } from "@/lib/tauri";

import { type Alignment, alignEdits, distributeEdits } from "../engine/edit/arrange";
import { layerEdits, type LayerStep, sceneMoveEdits } from "../engine/edit/targets";
import type { LayoutSettings, PixelRect } from "../engine/layout/solve";
import { labelOf } from "../engine/model/layers";
import { sceneOf, type ViewTree } from "../engine/model/tree";
import { useDeleteElements } from "../hooks/useDeleteElements";
import { useAtlasEdit } from "../state/atlasEdit";

export interface ElementEditItemsProps {
  /** The view the element is in, as `viewKey` names it. */
  readonly view: string;
  readonly tree: ViewTree;
  readonly settings: LayoutSettings;
  readonly solved: ReadonlyMap<string, PixelRect> | null;
  /** The element the menu opened on. */
  readonly target: string;
  readonly selection: readonly string[];
  /** Show the canvas's keys beside the actions. */
  readonly canvas: boolean;
}

const LAYER_STEPS: readonly {
  readonly step: LayerStep;
  readonly icon: ReactNode;
  readonly label: () => string;
  readonly shortcut: string;
}[] = [
  {
    step: "front",
    icon: <ArrowLineUpIcon />,
    label: m.workshop_bin_atlas_front_action,
    shortcut: "}",
  },
  {
    step: "forward",
    icon: <ArrowUpIcon />,
    label: m.workshop_bin_atlas_forward_action,
    shortcut: "]",
  },
  {
    step: "backward",
    icon: <ArrowDownIcon />,
    label: m.workshop_bin_atlas_backward_action,
    shortcut: "[",
  },
  {
    step: "back",
    icon: <ArrowLineDownIcon />,
    label: m.workshop_bin_atlas_back_action,
    shortcut: "{",
  },
];

const ALIGNMENTS: readonly {
  readonly how: Alignment;
  readonly icon: ReactNode;
  readonly label: () => string;
}[] = [
  { how: "left", icon: <AlignLeftIcon />, label: m.workshop_bin_atlas_align_left_action },
  {
    how: "centre",
    icon: <AlignCenterHorizontalIcon />,
    label: m.workshop_bin_atlas_align_centre_action,
  },
  { how: "right", icon: <AlignRightIcon />, label: m.workshop_bin_atlas_align_right_action },
  { how: "top", icon: <AlignTopIcon />, label: m.workshop_bin_atlas_align_top_action },
  {
    how: "middle",
    icon: <AlignCenterVerticalIcon />,
    label: m.workshop_bin_atlas_align_middle_action,
  },
  { how: "bottom", icon: <AlignBottomIcon />, label: m.workshop_bin_atlas_align_bottom_action },
];

/**
 * The edit actions of an element's menu, per "Interaction" in docs/plans/atlas-ui-editor.md:
 * its place in its siblings' draw order, the scene it draws in, and, with more than one element
 * selected, lining the selection up and spacing it evenly. Each is one undo step, and none shows
 * where the scene bin takes no edits. Delete, last, is `useDeleteElements`'s and shows where the
 * scene bin removes an object.
 */
export function ElementEditItems({
  view,
  tree,
  settings,
  solved,
  target,
  selection,
  canvas,
}: ElementEditItemsProps) {
  const edit = useAtlasEdit();
  const deleter = useDeleteElements(view, tree);
  if (edit === null || !edit.editable) return null;

  const acting = selection.includes(target) ? selection : [target];
  const run = (edits: readonly PropertyEdit[]) => void edit.apply(edits);
  const current = sceneOf(tree, target);
  const scenes = [...tree.scenes.values()].filter((scene) => scene.key !== current);

  return (
    <>
      <ContextMenu.SubmenuRoot>
        <ContextMenu.SubmenuTrigger icon={<StackIcon />}>
          {m.workshop_bin_atlas_arrange_label()}
        </ContextMenu.SubmenuTrigger>
        <ContextMenu.SubmenuContent className="w-52">
          {LAYER_STEPS.map(({ step, icon, label, shortcut }) => (
            <ContextMenu.Item
              key={step}
              icon={icon}
              shortcut={canvas ? shortcut : undefined}
              onClick={() => run(layerEdits(tree, target, step))}
            >
              {label()}
            </ContextMenu.Item>
          ))}
        </ContextMenu.SubmenuContent>
      </ContextMenu.SubmenuRoot>
      {scenes.length > 0 && (
        <ContextMenu.SubmenuRoot>
          <ContextMenu.SubmenuTrigger icon={<StackSimpleIcon />}>
            {m.workshop_bin_atlas_move_scene_label()}
          </ContextMenu.SubmenuTrigger>
          <ContextMenu.SubmenuContent className="max-h-80 w-60 overflow-y-auto">
            {scenes.map((scene) => (
              <ContextMenu.Item
                key={scene.key}
                onClick={() => run(acting.flatMap((key) => sceneMoveEdits(tree, key, scene.key)))}
              >
                {labelOf(scene.label, scene.path, scene.key)}
              </ContextMenu.Item>
            ))}
          </ContextMenu.SubmenuContent>
        </ContextMenu.SubmenuRoot>
      )}
      {acting.length > 1 && solved !== null && (
        <ContextMenu.SubmenuRoot>
          <ContextMenu.SubmenuTrigger icon={<AlignLeftIcon />}>
            {m.workshop_bin_atlas_align_label()}
          </ContextMenu.SubmenuTrigger>
          <ContextMenu.SubmenuContent className="w-56">
            {ALIGNMENTS.map(({ how, icon, label }) => (
              <ContextMenu.Item
                key={how}
                icon={icon}
                onClick={() => run(alignEdits(tree, settings, solved, acting, how))}
              >
                {label()}
              </ContextMenu.Item>
            ))}
            {acting.length > 2 && (
              <>
                <ContextMenu.Separator />
                <ContextMenu.Item
                  icon={<ColumnsIcon />}
                  onClick={() => run(distributeEdits(tree, settings, solved, acting, 0))}
                >
                  {m.workshop_bin_atlas_distribute_horizontal_action()}
                </ContextMenu.Item>
                <ContextMenu.Item
                  icon={<RowsIcon />}
                  onClick={() => run(distributeEdits(tree, settings, solved, acting, 1))}
                >
                  {m.workshop_bin_atlas_distribute_vertical_action()}
                </ContextMenu.Item>
              </>
            )}
          </ContextMenu.SubmenuContent>
        </ContextMenu.SubmenuRoot>
      )}
      {deleter.available && (
        <ContextMenu.Item
          icon={<TrashIcon />}
          variant="danger"
          shortcut="Del"
          onClick={() => void deleter.run(acting)}
        >
          {m.workshop_bin_atlas_delete_action()}
        </ContextMenu.Item>
      )}
    </>
  );
}

import {
  ArrowSquareOutIcon,
  ArrowsInIcon,
  CheckIcon,
  CopyIcon,
  CornersOutIcon,
  EyeIcon,
  EyeSlashIcon,
  ExportIcon,
  PathIcon,
  SelectionSlashIcon,
  SquaresFourIcon,
  StackSimpleIcon,
} from "@phosphor-icons/react";

import { ContextMenu } from "@/components";
import { useCopyToClipboard } from "@/hooks";
import { m } from "@/i18n";
import type { BinDocumentId } from "@/lib/tauri";

import { objectDocument } from "../../../documents/utils/contentDocument";
import type { OpenIntent } from "../../../palette/utils/types";
import { useOpenDocumentAs } from "../../../state";
import { labelOf } from "../engine/model/layers";
import { exportedSprite } from "../engine/model/sprites";
import { sceneOf } from "../engine/model/tree";
import { useAtlasLayout } from "../hooks/useAtlasLayout";
import type { ViewSource } from "../hooks/useAtlasSources";
import { useHiddenScenes } from "../hooks/useHiddenScenes";
import { useSpriteExport } from "../hooks/useSpriteExport";
import { useAtlasPreviewActions, useViewPreview, viewKey } from "../state/atlasPreview";
import { ElementEditItems } from "./ElementEditItems";

export interface ElementMenuProps {
  readonly document: BinDocumentId;
  /** The view controller object. */
  readonly entry: string;
  /** The element the menu opened on, and null for the canvas's empty space. */
  readonly element: string | null;
  /** The menu opened on the canvas, which adds the view's own actions. */
  readonly canvas?: boolean;
  /** Every element under the pointer the canvas menu opened at, topmost first. */
  readonly under?: readonly string[];
  readonly source?: ViewSource;
}

/**
 * The menu of an element in the canvas or the layers pane: frame it, select its group or any
 * element stacked under the pointer with it, hide it or
 * its scene in the preview, arrange it and the selection (`ElementEditItems`), open its object, and
 * copy its name or path. The shortcuts shown are the canvas's own keys.
 */
export function ElementMenu({
  document,
  entry,
  element,
  canvas = false,
  under = [],
  source = "controller",
}: ElementMenuProps) {
  const { view, tree, settings, solved } = useAtlasLayout(document, entry, source);
  const key = viewKey(document, entry);
  const { selected, selection, hiddenElements } = useViewPreview(key);
  const hiddenScenes = useHiddenScenes(tree, key);
  const { select, toggleScene, toggleElement, requestFrame } = useAtlasPreviewActions();
  const open = useOpenDocumentAs();
  const copy = useCopyToClipboard();
  const exports = useSpriteExport();

  const target = element === null ? undefined : tree?.elements.get(element);
  if (tree === null || view === null || (target === undefined && !canvas)) return null;

  const group = target === undefined ? undefined : tree.groupOf.get(target.key);
  const scene = target === undefined ? null : sceneOf(tree, target.key);
  const held = scene === null ? undefined : tree.scenes.get(scene);
  const sceneLabel = held === undefined ? scene : labelOf(held.label, held.path, held.key);
  const base = view.files.find((file) => file.role === "base");
  const asset = base?.asset ?? null;
  const path = target === undefined ? null : (target.path ?? target.label);
  const sprite = target === undefined ? null : exportedSprite(tree, target.key);
  const openElement =
    target === undefined || base === undefined || asset === null || path === null
      ? null
      : (intent: OpenIntent) =>
          open(objectDocument(asset, target.key, path, base.path, target.class), intent);

  return (
    <ContextMenu.Portal>
      <ContextMenu.Positioner>
        <ContextMenu.Popup data-ui="ElementMenu" className="w-60" finalFocus={false}>
          {target !== undefined && (
            <>
              <ContextMenu.Item
                icon={<CornersOutIcon />}
                shortcut={canvas ? "F" : undefined}
                onClick={() => requestFrame(key, target.key)}
              >
                {m.workshop_bin_atlas_frame_action()}
              </ContextMenu.Item>
              {group !== undefined && (
                <ContextMenu.Item icon={<SquaresFourIcon />} onClick={() => select(key, group)}>
                  {m.workshop_bin_atlas_select_group_action()}
                </ContextMenu.Item>
              )}
              {under.length > 1 && (
                <ContextMenu.SubmenuRoot>
                  <ContextMenu.SubmenuTrigger icon={<StackSimpleIcon />}>
                    {m.workshop_bin_atlas_select_layer_label()}
                  </ContextMenu.SubmenuTrigger>
                  <ContextMenu.Portal>
                    <ContextMenu.SubmenuPositioner>
                      <ContextMenu.Popup className="max-h-80 w-64 overflow-y-auto">
                        {under.map((each) => {
                          const node = tree.elements.get(each);
                          return (
                            <ContextMenu.Item
                              key={each}
                              icon={each === selected ? <CheckIcon /> : undefined}
                              onClick={() => select(key, each)}
                            >
                              {node === undefined ? each : labelOf(node.label, node.path, each)}
                            </ContextMenu.Item>
                          );
                        })}
                      </ContextMenu.Popup>
                    </ContextMenu.SubmenuPositioner>
                  </ContextMenu.Portal>
                </ContextMenu.SubmenuRoot>
              )}
              <ContextMenu.Item
                icon={hiddenElements.has(target.key) ? <EyeIcon /> : <EyeSlashIcon />}
                onClick={() => toggleElement(key, target.key)}
              >
                {hiddenElements.has(target.key)
                  ? m.workshop_bin_atlas_element_show_action()
                  : m.workshop_bin_atlas_element_hide_action()}
              </ContextMenu.Item>
              {scene !== null && sceneLabel !== null && (
                <ContextMenu.Item
                  icon={hiddenScenes.has(scene) ? <EyeIcon /> : <EyeSlashIcon />}
                  onClick={() => toggleScene(key, scene)}
                >
                  {hiddenScenes.has(scene)
                    ? m.workshop_bin_atlas_scene_show_action({ scene: sceneLabel })
                    : m.workshop_bin_atlas_scene_hide_action({ scene: sceneLabel })}
                </ContextMenu.Item>
              )}
              <ContextMenu.Separator />
              <ElementEditItems
                tree={tree}
                settings={settings}
                solved={solved}
                target={target.key}
                selection={selection}
                canvas={canvas}
              />
              <ContextMenu.Separator />
              {openElement !== null && (
                <>
                  <ContextMenu.Item
                    icon={<ArrowSquareOutIcon />}
                    onClick={() => openElement("default")}
                  >
                    {m.workshop_bin_open_object_action()}
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    icon={<ArrowSquareOutIcon />}
                    onClick={() => openElement("beside")}
                  >
                    {m.workshop_bin_open_object_beside_action()}
                  </ContextMenu.Item>
                </>
              )}
              <ContextMenu.Item
                icon={<CopyIcon />}
                onClick={() => void copy(target.label, m.workshop_bin_name_label())}
              >
                {m.workshop_bin_copy_name_action()}
              </ContextMenu.Item>
              {path !== null && (
                <ContextMenu.Item
                  icon={<PathIcon />}
                  onClick={() => void copy(path, m.workshop_bin_path_label())}
                >
                  {m.workshop_bin_copy_path_action()}
                </ContextMenu.Item>
              )}
              {sprite !== null && (
                <ContextMenu.Item icon={<ExportIcon />} onClick={() => void exports.run(sprite)}>
                  {m.workshop_bin_atlas_sprites_export_action()}
                </ContextMenu.Item>
              )}
            </>
          )}
          {canvas && (
            <>
              {target !== undefined && <ContextMenu.Separator />}
              <ContextMenu.Item
                icon={<ArrowsInIcon />}
                shortcut="0"
                onClick={() => requestFrame(key, null)}
              >
                {m.workshop_bin_atlas_fit_action()}
              </ContextMenu.Item>
              {selected !== null && (
                <ContextMenu.Item
                  icon={<SelectionSlashIcon />}
                  shortcut="Esc"
                  onClick={() => select(key, null)}
                >
                  {m.workshop_bin_atlas_clear_selection_action()}
                </ContextMenu.Item>
              )}
            </>
          )}
        </ContextMenu.Popup>
      </ContextMenu.Positioner>
    </ContextMenu.Portal>
  );
}

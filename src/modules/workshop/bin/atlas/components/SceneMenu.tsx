import {
  ArrowCounterClockwiseIcon,
  EyeIcon,
  EyeSlashIcon,
  FrameCornersIcon,
  SquareSplitHorizontalIcon,
  StackIcon,
} from "@phosphor-icons/react";

import { ContextMenu } from "@/components";
import { m } from "@/i18n";
import type { BinDocumentId } from "@/lib/tauri";

import { drawOn, frameHeads, NO_FRAME_CHOICES, splitFrame } from "../engine/layout/frames";
import { labelOf } from "../engine/model/layers";
import { useAtlasLayout } from "../hooks/useAtlasLayout";
import { useBoard } from "../hooks/useBoard";
import { useHiddenScenes } from "../hooks/useHiddenScenes";
import {
  useAtlasPreviewActions,
  useFrameSettings,
  useViewPreview,
  viewKey,
} from "../state/atlasPreview";

export interface SceneMenuProps {
  readonly document: BinDocumentId;
  /** The view controller object. */
  readonly entry: string;
  /** The scene the menu opened on. */
  readonly scene: string | null;
}

/**
 * The menu of a scene in the layers pane or of a frame's name on the canvas: switch the scene in
 * the preview, draw it on a frame of its own or on another frame with the scenes under it, split
 * a frame into its scenes, and put every scene back on the frame it starts on. None of it reaches
 * the file.
 */
export function SceneMenu({ document, entry, scene }: SceneMenuProps) {
  const { tree, screen } = useAtlasLayout(document, entry);
  const key = viewKey(document, entry);
  const board = useBoard(tree, screen, key);
  const hiddenScenes = useHiddenScenes(tree, key);
  const { frames: choices } = useViewPreview(key);
  const { stackScenes } = useFrameSettings();
  const { toggleScene, setFrames } = useAtlasPreviewActions();

  const held = scene === null ? undefined : tree?.scenes.get(scene);
  if (tree === null || board === null || held === undefined) return null;

  const label = labelOf(held.label, held.path, held.key);
  const head = frameHeads(tree, choices).get(held.key) ?? held.key;
  const own = board.frames.find((frame) => frame.scene === head);
  const others = board.frames.flatMap((frame) =>
    frame.scene === null || frame.scene === head ? [] : [{ head: frame.scene, label: frame.label }],
  );
  const draw = (target: string) => setFrames(key, drawOn(tree, choices, held.key, target));

  return (
    <ContextMenu.Portal>
      <ContextMenu.Positioner>
        <ContextMenu.Popup data-ui="SceneMenu" className="w-60" finalFocus={false}>
          <ContextMenu.Item
            icon={hiddenScenes.has(held.key) ? <EyeIcon /> : <EyeSlashIcon />}
            onClick={() => toggleScene(key, held.key)}
          >
            {hiddenScenes.has(held.key)
              ? m.workshop_bin_atlas_scene_show_action({ scene: label })
              : m.workshop_bin_atlas_scene_hide_action({ scene: label })}
          </ContextMenu.Item>
          {!stackScenes && (
            <>
              <ContextMenu.Separator />
              {head !== held.key && (
                <ContextMenu.Item icon={<FrameCornersIcon />} onClick={() => draw(held.key)}>
                  {m.workshop_bin_atlas_frame_own_action()}
                </ContextMenu.Item>
              )}
              {others.length > 0 && (
                <ContextMenu.SubmenuRoot>
                  <ContextMenu.SubmenuTrigger icon={<StackIcon />}>
                    {m.workshop_bin_atlas_frame_join_label()}
                  </ContextMenu.SubmenuTrigger>
                  <ContextMenu.Portal>
                    <ContextMenu.SubmenuPositioner>
                      <ContextMenu.Popup className="max-h-80 w-60 overflow-y-auto">
                        {others.map((frame) => (
                          <ContextMenu.Item key={frame.head} onClick={() => draw(frame.head)}>
                            {frame.label}
                          </ContextMenu.Item>
                        ))}
                      </ContextMenu.Popup>
                    </ContextMenu.SubmenuPositioner>
                  </ContextMenu.Portal>
                </ContextMenu.SubmenuRoot>
              )}
              {head === held.key && own !== undefined && own.scenes.length > 1 && (
                <ContextMenu.Item
                  icon={<SquareSplitHorizontalIcon />}
                  onClick={() => setFrames(key, splitFrame(tree, choices, head, own.scenes))}
                >
                  {m.workshop_bin_atlas_frame_split_action()}
                </ContextMenu.Item>
              )}
              {Object.keys(choices).length > 0 && (
                <ContextMenu.Item
                  icon={<ArrowCounterClockwiseIcon />}
                  onClick={() => setFrames(key, NO_FRAME_CHOICES)}
                >
                  {m.workshop_bin_atlas_frame_reset_action()}
                </ContextMenu.Item>
              )}
            </>
          )}
        </ContextMenu.Popup>
      </ContextMenu.Positioner>
    </ContextMenu.Portal>
  );
}

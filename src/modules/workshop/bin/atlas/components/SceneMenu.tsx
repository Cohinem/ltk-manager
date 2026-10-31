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

import { useAtlasLayout } from "../hooks/useAtlasLayout";
import { useHiddenScenes } from "../hooks/useHiddenScenes";
import { useSceneFrames } from "../hooks/useSceneFrames";
import { useAtlasPreviewActions, viewKey } from "../state/atlasPreview";

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
  const { tree } = useAtlasLayout(document, entry);
  const key = viewKey(document, entry);
  const hiddenScenes = useHiddenScenes(tree, key);
  const { toggleScene } = useAtlasPreviewActions();
  const frames = useSceneFrames(document, entry, scene);
  if (frames === null) return null;

  const { key: held, label, stacked, drawOwn, others, drawOnFrame, split, reset } = frames;

  return (
    <ContextMenu.Content data-ui="SceneMenu" className="w-60" finalFocus={false}>
      <ContextMenu.Item
        icon={hiddenScenes.has(held) ? <EyeIcon /> : <EyeSlashIcon />}
        onClick={() => toggleScene(key, held)}
      >
        {hiddenScenes.has(held)
          ? m.workshop_bin_atlas_scene_show_action({ scene: label })
          : m.workshop_bin_atlas_scene_hide_action({ scene: label })}
      </ContextMenu.Item>
      {!stacked && (
        <>
          <ContextMenu.Separator />
          {drawOwn !== null && (
            <ContextMenu.Item icon={<FrameCornersIcon />} onClick={drawOwn}>
              {m.workshop_bin_atlas_frame_own_action()}
            </ContextMenu.Item>
          )}
          {others.length > 0 && (
            <ContextMenu.SubmenuRoot>
              <ContextMenu.SubmenuTrigger icon={<StackIcon />}>
                {m.workshop_bin_atlas_frame_join_label()}
              </ContextMenu.SubmenuTrigger>
              <ContextMenu.SubmenuContent className="max-h-80 w-60 overflow-y-auto">
                {others.map((frame) => (
                  <ContextMenu.Item key={frame.head} onClick={() => drawOnFrame(frame.head)}>
                    {frame.label}
                  </ContextMenu.Item>
                ))}
              </ContextMenu.SubmenuContent>
            </ContextMenu.SubmenuRoot>
          )}
          {split !== null && (
            <ContextMenu.Item icon={<SquareSplitHorizontalIcon />} onClick={split}>
              {m.workshop_bin_atlas_frame_split_action()}
            </ContextMenu.Item>
          )}
          {reset !== null && (
            <ContextMenu.Item icon={<ArrowCounterClockwiseIcon />} onClick={reset}>
              {m.workshop_bin_atlas_frame_reset_action()}
            </ContextMenu.Item>
          )}
        </>
      )}
    </ContextMenu.Content>
  );
}

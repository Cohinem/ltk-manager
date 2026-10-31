import type { BinDocumentId } from "@/lib/tauri";

import { drawOn, frameHeads, NO_FRAME_CHOICES, splitFrame } from "../engine/layout/frames";
import { labelOf } from "../engine/model/layers";
import {
  useAtlasPreviewActions,
  useFrameSettings,
  useViewPreview,
  viewKey,
} from "../state/atlasPreview";
import { useAtlasLayout } from "./useAtlasLayout";
import { useBoard } from "./useBoard";

/** One frame that a scene draws on instead of its own. */
export interface OtherFrame {
  readonly head: string;
  readonly label: string;
}

/** What a scene's menu offers for the frame that the scene draws on. */
export interface SceneFrames {
  readonly key: string;
  readonly label: string;
  /** `true` while every scene draws on one screen, so no frame choice applies. */
  readonly stacked: boolean;
  /** Draws the scene on a frame of its own, null if it heads one. */
  readonly drawOwn: (() => void) | null;
  /** The other frames that the scene can draw on. */
  readonly others: readonly OtherFrame[];
  readonly drawOnFrame: (head: string) => void;
  /** Splits the frame that the scene heads into its scenes, null if it holds one. */
  readonly split: (() => void) | null;
  /** Puts every scene back on the frame it starts on, null if none moved. */
  readonly reset: (() => void) | null;
}

/** Returns the frame actions of `scene`, or null while the view is unread or has no such scene. */
export function useSceneFrames(
  document: BinDocumentId,
  entry: string,
  scene: string | null,
): SceneFrames | null {
  const { tree, screen } = useAtlasLayout(document, entry);
  const view = viewKey(document, entry);
  const board = useBoard(tree, screen, view);
  const { frames: choices } = useViewPreview(view);
  const { stackScenes } = useFrameSettings();
  const { setFrames } = useAtlasPreviewActions();

  const held = scene === null ? undefined : tree?.scenes.get(scene);
  if (tree === null || board === null || held === undefined) return null;

  const head = frameHeads(tree, choices).get(held.key) ?? held.key;
  const own = board.frames.find((frame) => frame.scene === head);
  const draw = (target: string) => setFrames(view, drawOn(tree, choices, held.key, target));

  return {
    key: held.key,
    label: labelOf(held.label, held.path, held.key),
    stacked: stackScenes,
    drawOwn: head === held.key ? null : () => draw(held.key),
    others: board.frames.flatMap((frame) =>
      frame.scene === null || frame.scene === head
        ? []
        : [{ head: frame.scene, label: frame.label }],
    ),
    drawOnFrame: draw,
    split:
      head === held.key && own !== undefined && own.scenes.length > 1
        ? () => setFrames(view, splitFrame(tree, choices, head, own.scenes))
        : null,
    reset: Object.keys(choices).length > 0 ? () => setFrames(view, NO_FRAME_CHOICES) : null,
  };
}

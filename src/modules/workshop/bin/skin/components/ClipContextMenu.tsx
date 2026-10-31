import { ArrowSquareOutIcon } from "@phosphor-icons/react";

import { ContextMenu } from "@/components";
import { m } from "@/i18n";
import type { GraphClip } from "@/lib/tauri";

import { useOpenDocumentAs } from "../../../state";
import { clipDocument } from "../hooks/useClipCommands";

export function ClipContextMenu({ clip }: { clip: GraphClip }) {
  const open = useOpenDocumentAs();
  const animation = clip.animation;
  const document = clipDocument(clip);
  return (
    <ContextMenu.Content>
      <ContextMenu.Item
        icon={<ArrowSquareOutIcon />}
        disabled={document === null}
        title={animation?.path}
        onClick={() => document && open(document, "default")}
      >
        {m.workshop_bin_clip_open_animation_action()}
      </ContextMenu.Item>
      <ContextMenu.Item
        icon={<ArrowSquareOutIcon />}
        disabled={document === null}
        onClick={() => document && open(document, "beside")}
      >
        {m.workshop_bin_clip_open_animation_beside_action()}
      </ContextMenu.Item>
    </ContextMenu.Content>
  );
}

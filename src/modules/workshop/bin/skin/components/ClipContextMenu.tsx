import { ArrowSquareOutIcon } from "@phosphor-icons/react";

import { ContextMenu } from "@/components";
import { m } from "@/i18n";
import type { GraphClip } from "@/lib/tauri";

import { previewDocument } from "../../../documents/utils/contentDocument";
import { useOpenDocumentAs } from "../../../state";

export function ClipContextMenu({ clip }: { clip: GraphClip }) {
  const open = useOpenDocumentAs();
  const animation = clip.animation;
  const document = animation?.asset ? previewDocument(animation.asset, animation.path) : null;
  return (
    <ContextMenu.Portal>
      <ContextMenu.Positioner>
        <ContextMenu.Popup>
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
        </ContextMenu.Popup>
      </ContextMenu.Positioner>
    </ContextMenu.Portal>
  );
}

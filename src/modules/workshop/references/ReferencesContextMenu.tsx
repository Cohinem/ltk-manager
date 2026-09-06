import {
  ArrowSquareOutIcon,
  FileIcon,
  HashIcon,
  MagnifyingGlassIcon,
  PathIcon,
} from "@phosphor-icons/react";

import { ContextMenu } from "@/components";
import { useCopyToClipboard } from "@/hooks";
import { m } from "@/i18n";

import { useShowInFile } from "../bin/useShowInFile";
import type { OpenIntent } from "../palette/types";
import type { ReferenceNode, ReferenceObjectNode } from "./referenceTree";
import { objectReferences, useFindReferences } from "./useFindReferences";

interface ReferencesContextMenuProps {
  /** The row the menu was opened on. Absent while it has never been opened. */
  node: ReferenceNode | null;
  onOpen: (node: ReferenceObjectNode, intent: OpenIntent) => void;
}

/**
 * The References tree's one menu, aimed at whichever row opened it.
 *
 * The objects browser's items over one declaration: the file is the group the row sits
 * in, so Show in file goes there rather than anywhere else.
 */
export function ReferencesContextMenu({ node, onOpen }: ReferencesContextMenuProps) {
  const copy = useCopyToClipboard();
  const showInFile = useShowInFile();
  const find = useFindReferences();

  if (node?.type !== "object") return null;

  return (
    <ContextMenu.Portal>
      <ContextMenu.Positioner>
        <ContextMenu.Popup className="w-56">
          <ContextMenu.Item
            icon={<ArrowSquareOutIcon className="h-4 w-4" />}
            onClick={() => onOpen(node, "default")}
          >
            {m.workshop_objects_open_action()}
          </ContextMenu.Item>
          <ContextMenu.Item
            icon={<ArrowSquareOutIcon className="h-4 w-4" />}
            onClick={() => onOpen(node, "beside")}
          >
            {m.workshop_objects_open_beside_action()}
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item
            icon={<FileIcon className="h-4 w-4" />}
            onClick={() => showInFile(node.asset, node.objectHash, node.file)}
          >
            {m.workshop_objects_show_in_file_action()}
          </ContextMenu.Item>
          <ContextMenu.Item
            icon={<MagnifyingGlassIcon className="h-4 w-4" />}
            onClick={() => find(objectReferences(node.objectHash, node.path))}
          >
            {m.workshop_references_find_object_action()}
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item
            icon={<PathIcon className="h-4 w-4" />}
            onClick={() => void copy(node.path, m.workshop_bin_path_label())}
          >
            {m.workshop_objects_copy_path_action()}
          </ContextMenu.Item>
          <ContextMenu.Item
            icon={<HashIcon className="h-4 w-4" />}
            onClick={() => void copy(node.objectHash, m.workshop_bin_hash_label())}
          >
            {m.workshop_objects_copy_hash_action()}
          </ContextMenu.Item>
          {node.class === null && (
            <ContextMenu.Item
              icon={<HashIcon className="h-4 w-4" />}
              onClick={() => void copy(node.classHash, m.workshop_bin_hash_label())}
            >
              {m.workshop_objects_copy_class_hash_action()}
            </ContextMenu.Item>
          )}
        </ContextMenu.Popup>
      </ContextMenu.Positioner>
    </ContextMenu.Portal>
  );
}

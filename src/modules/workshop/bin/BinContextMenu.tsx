import {
  ArrowSquareOutIcon,
  HashIcon,
  LinkIcon,
  PathIcon,
  TreeStructureIcon,
} from "@phosphor-icons/react";

import { ContextMenu } from "@/components";
import { useCopyToClipboard } from "@/hooks";
import { m } from "@/i18n";
import type { BinRow, BinValue } from "@/lib/tauri";

import type { ContentDocument } from "../documents/contentDocument";
import { useRevealInObjects } from "../objectsBrowser/useRevealInObjects";
import type { OpenIntent } from "../palette/types";
import { useOpenDocumentAs } from "../state";
import type { VisibleRow } from "./binRows";
import { decideLink, type LinkDecision } from "./linkDecision";
import { useLayerCopy, useLinkOpen, useLinkTargets } from "./useLinkTargets";

interface BinContextMenuProps {
  /** The line the menu was opened on. Absent while it has never been opened. */
  line: VisibleRow | null;
  /** The name of the object an entry hash addresses, for the path a row copies. */
  objectName: (entry: string) => string;
  /** Open the object a row declares. Absent where no row is an object. */
  onOpenObject?: (row: BinRow, intent: OpenIntent) => void;
}

/**
 * The list's one menu, aimed at whichever row opened it.
 *
 * Copy path is the address of ADR-0027 as a person reads it: the object's path and the
 * property path joined on a colon, and the object's path alone for an object row.
 */
export function BinContextMenu({ line, objectName, onOpenObject }: BinContextMenuProps) {
  const copy = useCopyToClipboard();
  const open = useOpenDocumentAs();
  const revealInObjects = useRevealInObjects();
  const targets = useLinkTargets();
  const { wantOpen } = useLinkOpen();
  const row = line?.kind === "row" ? line.row : null;
  const layer = useLayerCopy(row?.value.type === "wadChunkLink" ? row.value.path : null);

  if (row === null) return null;
  const object = row.node === "object";
  const path = object ? row.name : `${objectName(row.entry)}:${row.label}`;
  const valueHash = unnamedValueHash(row.value);
  const link = decideLink(row.value, targets, () => layer);
  const openLink = linkOpener(row.value, link, open, wantOpen);

  return (
    <ContextMenu.Portal>
      <ContextMenu.Positioner>
        <ContextMenu.Popup className="w-56">
          {openLink && (
            <>
              <ContextMenu.Item icon={<LinkIcon />} onClick={() => openLink("default")}>
                {m.workshop_bin_open_link_action()}
              </ContextMenu.Item>
              <ContextMenu.Item icon={<LinkIcon />} onClick={() => openLink("beside")}>
                {m.workshop_bin_open_link_beside_action()}
              </ContextMenu.Item>
              <ContextMenu.Separator />
            </>
          )}
          {object && onOpenObject && (
            <>
              <ContextMenu.Item
                icon={<ArrowSquareOutIcon />}
                onClick={() => onOpenObject(row, "default")}
              >
                {m.workshop_bin_open_object_action()}
              </ContextMenu.Item>
              <ContextMenu.Item
                icon={<ArrowSquareOutIcon />}
                onClick={() => onOpenObject(row, "beside")}
              >
                {m.workshop_bin_open_object_beside_action()}
              </ContextMenu.Item>
              <ContextMenu.Separator />
            </>
          )}
          {object && (
            <>
              <ContextMenu.Item
                icon={<TreeStructureIcon />}
                onClick={() => revealInObjects(row.name)}
              >
                {m.workshop_objects_reveal_action()}
              </ContextMenu.Item>
              <ContextMenu.Separator />
            </>
          )}
          <ContextMenu.Item
            icon={<PathIcon />}
            onClick={() => void copy(path, m.workshop_bin_path_label())}
          >
            {m.workshop_bin_copy_path_action()}
          </ContextMenu.Item>
          {row.unnamed && (
            <ContextMenu.Item
              icon={<HashIcon />}
              onClick={() => void copy(row.name, m.workshop_bin_hash_label())}
            >
              {m.workshop_bin_copy_hash_action()}
            </ContextMenu.Item>
          )}
          {valueHash !== null && (
            <ContextMenu.Item
              icon={<HashIcon />}
              onClick={() => void copy(valueHash, m.workshop_bin_hash_label())}
            >
              {m.workshop_bin_copy_value_hash_action()}
            </ContextMenu.Item>
          )}
        </ContextMenu.Popup>
      </ContextMenu.Positioner>
    </ContextMenu.Portal>
  );
}

/** What Open link does for a row, or null where the row's value opens nothing. */
function linkOpener(
  value: BinValue,
  link: LinkDecision | null,
  open: (document: ContentDocument, intent: OpenIntent) => void,
  wantOpen: (hash: string, intent: OpenIntent) => void,
): ((intent: OpenIntent) => void) | null {
  if (link?.kind === "chip") return (intent) => open(link.document, intent);
  if (link?.kind === "warm" && value.type === "objectLink") {
    return (intent) => wantOpen(value.hash, intent);
  }
  return null;
}

/** The hash a value shows in place of a name, or null where a table named it. */
function unnamedValueHash(value: BinValue): string | null {
  switch (value.type) {
    case "hash":
    case "objectLink":
      return value.name === null ? value.hash : null;
    case "wadChunkLink":
      return value.path === null ? value.hash : null;
    case "struct":
      return value.class === null ? value.classHash : null;
    default:
      return null;
  }
}

import {
  ArrowSquareOutIcon,
  BracketsSquareIcon,
  CopyIcon,
  CopySimpleIcon,
  GitForkIcon,
  HashIcon,
  ListNumbersIcon,
  PencilSimpleIcon,
  PlugsConnectedIcon,
  PlusIcon,
  SwapIcon,
  ShuffleIcon,
  TrashIcon,
  WaveformIcon,
} from "@phosphor-icons/react";

import { ContextMenu, ExperimentalChip } from "@/components";
import { m } from "@/i18n";
import type { AudioEvent, ContainerKind, MediaLocation } from "@/lib/tauri";

import { previewDocument } from "../../documents/utils/contentDocument";
import { useOptionalProjectContext } from "../../projects/state/ProjectContext";
import { useOpenDocumentAs } from "../../state";
import { useOpenSiteRow } from "../hooks/useOpenSiteRow";
import { useFocusMedia } from "../state/mediaFocus";
import type { EventRow } from "../utils/eventTree";

/** The keys of the node actions, as the trees bind them. Per "Selection" in docs/ux/AUDIO.md. */
export const NODE_KEYS = {
  add: "Ctrl+Enter",
  duplicate: "Ctrl+D",
  remove: "Delete",
  copy: "Ctrl+C",
} as const;

/** What the menu of a row does to the picked rows, each null where it does not apply. */
export interface NodeActions {
  /** Opens the add row of the row's container or event. */
  readonly add: (() => void) | null;
  readonly duplicate: (() => void) | null;
  readonly wrap: ((container: ContainerKind) => void) | null;
  readonly remove: (() => void) | null;
  readonly copy: () => void;
  /** Opens the name entry of the picked event, to rename it. */
  readonly rename: ((event: AudioEvent) => void) | null;
  /** Opens the picker of the sound field that the picked event is set in. */
  readonly assignTo: ((event: AudioEvent) => void) | null;
  /** Replaces the media that the picked sound plays with a file. */
  readonly replace: ((source: number) => void) | null;
}

const WRAPS: readonly {
  readonly kind: ContainerKind;
  readonly icon: typeof ShuffleIcon;
  readonly label: () => string;
}[] = [
  { kind: "random", icon: ShuffleIcon, label: () => m.audio_add_random_action() },
  { kind: "sequence", icon: ListNumbersIcon, label: () => m.audio_add_sequence_action() },
  { kind: "switch", icon: GitForkIcon, label: () => m.audio_add_switch_action() },
];

interface EventMenuProps {
  readonly row: EventRow;
  /** The actions on the picked rows, or null in a bank that takes no edit. */
  readonly actions: NodeActions | null;
  /** The count of the picked rows that the actions take. */
  readonly count: number;
  /** Copies the row's name or ID when the bank takes no edit. */
  readonly onCopy: (row: EventRow) => void;
}

/**
 * The context menu of one row of either view: the edits of the picked rows, the copies, Show
 * media on a sound whose media is found, and the rows of an event's sites. The experimental
 * actions share one group under one Experimental chip.
 *
 * Every item carries its icon, and the key that does the same in the tree. Per "Row actions" and
 * "Selection" in docs/ux/AUDIO.md.
 */
export function EventMenu({ row, actions, count, onCopy }: EventMenuProps) {
  const project = useOptionalProjectContext();
  const media = row.kind === "node" && row.node.kind === "sound" ? row.node.media : null;
  const event = row.kind === "event";
  const named = row.kind === "event" && row.event.name !== null ? row.event : null;
  const source = row.kind === "node" && row.node.kind === "sound" ? row.node.source : null;
  const rename = row.kind === "event" ? actions?.rename : null;
  const assignTo = named === null ? null : actions?.assignTo;
  const replace = source === null ? null : actions?.replace;
  const creates =
    actions !== null &&
    (actions.add !== null || actions.duplicate !== null || rename != null || assignTo != null);
  const copyLabel =
    count > 1
      ? m.audio_node_copy_many_action({ count })
      : event
        ? m.audio_event_copy_name_action()
        : m.audio_event_copy_id_action();

  return (
    <>
      {actions !== null && (creates || replace != null) && (
        <ContextMenu.Group>
          <ContextMenu.GroupLabel>
            <ExperimentalChip />
          </ContextMenu.GroupLabel>
          {actions.add !== null && (
            <ContextMenu.Item icon={<PlusIcon />} shortcut={NODE_KEYS.add} onClick={actions.add}>
              {m.audio_node_add_action()}
            </ContextMenu.Item>
          )}
          {actions.duplicate !== null && (
            <ContextMenu.Item
              icon={<CopySimpleIcon />}
              shortcut={NODE_KEYS.duplicate}
              onClick={actions.duplicate}
            >
              {m.audio_node_duplicate_action()}
            </ContextMenu.Item>
          )}
          {actions.wrap !== null && <WrapItems wrap={actions.wrap} />}
          {rename != null && row.kind === "event" && (
            <ContextMenu.Item icon={<PencilSimpleIcon />} onClick={() => rename(row.event)}>
              {m.audio_event_rename_action()}
            </ContextMenu.Item>
          )}
          {assignTo != null && named !== null && (
            <ContextMenu.Item icon={<PlugsConnectedIcon />} onClick={() => assignTo(named)}>
              {m.audio_event_use_action()}
            </ContextMenu.Item>
          )}
          {replace != null && source !== null && (
            <ContextMenu.Item icon={<SwapIcon />} onClick={() => replace(source)}>
              {m.audio_replace_action()}
            </ContextMenu.Item>
          )}
        </ContextMenu.Group>
      )}
      {actions?.remove != null && (
        <ContextMenu.Item
          icon={<TrashIcon />}
          shortcut={NODE_KEYS.remove}
          variant="danger"
          onClick={actions.remove}
        >
          {m.audio_node_delete_action()}
        </ContextMenu.Item>
      )}
      {actions !== null && <ContextMenu.Separator />}
      {(event || row.kind === "action" || row.kind === "node") && (
        <ContextMenu.Item
          icon={event && count <= 1 ? <CopyIcon /> : <HashIcon />}
          shortcut={NODE_KEYS.copy}
          onClick={() => (actions === null ? onCopy(row) : actions.copy())}
        >
          {copyLabel}
        </ContextMenu.Item>
      )}
      {media !== null && project !== null && <ShowMediaItem media={media} />}
      {row.kind === "event" && project !== null && <EventSiteItems event={row.event} />}
    </>
  );
}

/** Wrap in container and its submenu of the container kinds. */
function WrapItems({ wrap }: { wrap: (container: ContainerKind) => void }) {
  return (
    <ContextMenu.SubmenuRoot>
      <ContextMenu.SubmenuTrigger icon={<BracketsSquareIcon />}>
        {m.audio_node_wrap_action()}
      </ContextMenu.SubmenuTrigger>
      <ContextMenu.SubmenuContent>
        {WRAPS.map(({ kind, icon: Icon, label }) => (
          <ContextMenu.Item key={kind} icon={<Icon />} onClick={() => wrap(kind)}>
            {label()}
          </ContextMenu.Item>
        ))}
      </ContextMenu.SubmenuContent>
    </ContextMenu.SubmenuRoot>
  );
}

/**
 * Show contextual rule, which opens the first rule that plays `event`, and Show in bank unit,
 * which opens the `events[i]` row of the unit that lists its name.
 *
 * Rendered only inside a project, which owns the editor tabs.
 */
function EventSiteItems({ event }: { event: AudioEvent }) {
  const openRow = useOpenSiteRow();
  const rule = event.contexts[0]?.row ?? null;
  const listed = event.listed;

  return (
    <>
      {rule !== null && rule.asset !== null && (
        <ContextMenu.Item icon={<ArrowSquareOutIcon />} onClick={() => openRow(rule)}>
          {m.audio_event_show_rule_action()}
        </ContextMenu.Item>
      )}
      {listed !== null && listed.asset !== null && (
        <ContextMenu.Item icon={<ArrowSquareOutIcon />} onClick={() => openRow(listed)}>
          {m.audio_event_show_in_unit_action()}
        </ContextMenu.Item>
      )}
    </>
  );
}

/**
 * Opens the document of the file that contains `media`, on its Media tab with the row selected.
 *
 * Rendered only inside a project, which owns the editor tabs.
 */
function ShowMediaItem({ media }: { media: MediaLocation }) {
  const open = useOpenDocumentAs();
  const focus = useFocusMedia();

  return (
    <ContextMenu.Item
      icon={<WaveformIcon />}
      onClick={() => {
        focus(media.asset, media.source);
        open(previewDocument(media.asset, media.path), "default");
      }}
    >
      {m.audio_event_show_media_action()}
    </ContextMenu.Item>
  );
}

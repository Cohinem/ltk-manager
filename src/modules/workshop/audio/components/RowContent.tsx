import { WarningIcon, XCircleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { m } from "@/i18n";
import type { AudioEvent, EventAction, EventNode, EventStatus } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { useNodeNames } from "../state/nodeNames";
import { type EventRow, eventLabel, objectLabel } from "../utils/eventTree";
import { nodeName, type NodeNames, nodeText } from "../utils/nodeNames";

/** What one row is, by its kind. */
export function RowContent({ row }: { row: EventRow }) {
  switch (row.kind) {
    case "event":
      return <EventContent event={row.event} />;
    case "action":
      return <ActionContent action={row.action} />;
    case "node":
      return <NodeContent node={row.node} />;
    case "loading":
      return <span className="text-meta text-surface-400">{m.audio_event_loading_label()}</span>;
    case "failed":
      return (
        <Status tone="danger">
          <span className="select-text">{row.message}</span>
        </Status>
      );
    case "field":
    case "children":
      return null;
  }
}

/** The name, the action count and the status of an event row. */
export function EventContent({ event }: { event: AudioEvent }) {
  return (
    <>
      <span
        className={twMerge(
          "truncate font-medium",
          event.name === null ? "text-surface-400" : "text-surface-100",
        )}
      >
        {eventLabel(event)}
      </span>
      <span className="shrink-0 text-meta text-surface-400">
        {m.audio_event_actions_label({ count: event.actionCount })}
      </span>
      <EventStatusMark status={event.status} />
    </>
  );
}

function EventStatusMark({ status }: { status: EventStatus }) {
  switch (status.kind) {
    case "resolved":
      return null;
    case "mediaMissing":
      return <Status tone="warning">{m.audio_event_media_missing_label()}</Status>;
    case "objectMissing":
      return <Status tone="warning">{m.audio_event_object_missing_label()}</Status>;
    case "decodeError":
      return (
        <Status tone="danger">
          {m.audio_event_decode_error_label({ object: String(status.object) })}
          <span className="select-text">{status.message}</span>
        </Status>
      );
  }
}

/** Returns the text of the object that `action` targets: its derived name and its ID. */
function targetText(names: NodeNames, action: EventAction, target: number): string {
  if (action.node !== null) return nodeText(names, action.node);

  const name = names.nodes.get(target);
  return name === undefined
    ? objectLabel(target)
    : m.audio_node_named_label({ name, id: String(target) });
}

function ActionContent({ action }: { action: EventAction }) {
  const names = useNodeNames();
  if (action.label === null) {
    return (
      <Status tone="warning">
        {m.audio_event_missing_action_label({ id: String(action.id) })}
      </Status>
    );
  }

  return (
    <>
      <NamedId name={names.actions.get(action.id) ?? action.label} id={action.id} />
      {action.target !== null && (
        <span className="truncate text-meta text-surface-400">
          {targetText(names, action, action.target)}
        </span>
      )}
      {action.delay > 0 && (
        <span className="shrink-0 text-meta text-surface-400">
          {m.audio_event_action_delay_label({ ms: String(action.delay) })}
        </span>
      )}
    </>
  );
}

type ContainerNode = Extract<EventNode, { kind: "random" | "switch" | "layer" | "mixer" }>;

/** Returns the hint of a container row that names what plays. */
function containerHint(node: ContainerNode): string {
  switch (node.kind) {
    case "random":
      return node.mode === "sequence" ? m.audio_node_sequence_hint() : m.audio_node_random_hint();
    case "switch":
      return node.pick.kind === "firstChild"
        ? m.audio_node_switch_first_hint()
        : m.audio_node_switch_hint();
    case "layer":
      return m.audio_node_layer_hint();
    case "mixer":
      return m.audio_node_mixer_hint();
  }
}

interface NamedIdProps {
  /** The derived name of the object, or its kind. */
  readonly name: string;
  readonly id: number;
  /** Greys the name of an object that does not play. */
  readonly muted?: boolean;
}

/** The name of an object, then its decimal ID as a muted `#id`. */
export function NamedId({ name, id, muted = false }: NamedIdProps) {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span
        className={twMerge("truncate select-text", muted ? "text-surface-400" : "text-surface-200")}
      >
        {name}
      </span>
      <span className="shrink-0 font-mono text-meta text-code text-surface-400 select-text">
        {objectLabel(id)}
      </span>
    </span>
  );
}

function NodeContent({ node }: { node: EventNode }) {
  const names = useNodeNames();
  switch (node.kind) {
    case "sound":
      return (
        <>
          <NamedId name={nodeName(names, node)} id={node.id} />
          {node.media !== null && (
            <span className="truncate text-meta text-surface-400 select-text">
              {fileName(node.media.path)}
            </span>
          )}
          {node.media === null && (
            <Status tone="warning">{m.audio_event_media_missing_label()}</Status>
          )}
        </>
      );
    case "random":
    case "switch":
    case "layer":
    case "mixer": {
      return (
        <>
          <NamedId name={nodeName(names, node)} id={node.id} />
          <span className="truncate text-meta text-surface-400">{containerHint(node)}</span>
        </>
      );
    }
    case "unsupported": {
      const hint = node.music ? m.audio_node_music_hint() : m.audio_node_unsupported_hint();
      return (
        <>
          <NamedId name={nodeName(names, node)} id={node.id} muted />
          <span className="text-meta text-surface-400">{hint}</span>
        </>
      );
    }
    case "missing":
      return <Status tone="warning">{m.audio_node_missing_label({ id: String(node.id) })}</Status>;
  }
}

/** A status label with its glyph. DS-TEXT. */
export function Status({ tone, children }: { tone: "warning" | "danger"; children: ReactNode }) {
  const Icon = tone === "warning" ? WarningIcon : XCircleIcon;
  return (
    <span
      className={twMerge(
        "flex min-w-0 shrink-0 items-center gap-1 text-meta",
        tone === "warning" ? "text-warning-text" : "text-danger-text",
      )}
    >
      <Icon weight="fill" className="shrink-0" />
      {children}
    </span>
  );
}

/** Returns the last segment of the game path `path`. */
function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

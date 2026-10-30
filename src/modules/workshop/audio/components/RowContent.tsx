import { WarningIcon, XCircleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { Badge, Code, Tooltip } from "@/components";
import { m } from "@/i18n";
import type {
  Audience,
  AudioEvent,
  EventAction,
  EventContext,
  EventNode,
  EventStatus,
} from "@/lib/tauri";
import { twMerge } from "@/utils";

import { type EventRow, eventLabel, objectLabel } from "../utils/eventTree";

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

/** The name, the action count, the status and the contexts of an event row. */
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
      {event.contexts.length > 0 && <EventContexts contexts={event.contexts} />}
    </>
  );
}

const AUDIENCE_LABELS: Record<Audience, () => string> = {
  owner: m.audio_event_audience_owner_label,
  ally: m.audio_event_audience_ally_label,
  enemy: m.audio_event_audience_enemy_label,
  spectator: m.audio_event_audience_spectator_label,
};

/** Returns the situation, the rule and the audience of `context` on one line. */
function contextLabel(context: EventContext): string {
  return m.audio_event_context_label({
    situation: context.situation,
    rule: context.rule ?? m.audio_event_context_unnamed_rule_label(),
    audience: AUDIENCE_LABELS[context.audience](),
  });
}

/** The first contextual rule that plays an event, and how many more do, as an inferred badge. */
function EventContexts({ contexts }: { contexts: readonly EventContext[] }) {
  const [first] = contexts;
  if (first === undefined) return null;

  const hint = first.ambiguous
    ? m.audio_event_context_ambiguous_hint()
    : m.audio_event_context_inferred_hint();
  const label =
    contexts.length > 1
      ? m.audio_event_contexts_label({ context: contextLabel(first), more: contexts.length - 1 })
      : contextLabel(first);

  return (
    <Tooltip content={hint}>
      <Badge size="sm" dashed>
        {label}
      </Badge>
    </Tooltip>
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

function ActionContent({ action }: { action: EventAction }) {
  if (action.label === null) {
    return (
      <Status tone="warning">
        {m.audio_event_missing_action_label({ id: String(action.id) })}
      </Status>
    );
  }

  return (
    <>
      <span className="text-surface-200">{action.label}</span>
      {action.target !== null && (
        <span className="text-meta text-surface-400">
          <Code>{objectLabel(action.target)}</Code>
        </span>
      )}
      {action.delay > 0 && (
        <span className="text-meta text-surface-400">
          {m.audio_event_action_delay_label({ ms: String(action.delay) })}
        </span>
      )}
    </>
  );
}

type ContainerNode = Extract<EventNode, { kind: "random" | "switch" | "layer" | "mixer" }>;

/** Returns the title of a container row and the hint that names what plays. */
function containerLabels(node: ContainerNode) {
  switch (node.kind) {
    case "random":
      if (node.mode === "sequence") {
        return { title: m.audio_node_sequence_label, hint: m.audio_node_sequence_hint };
      }
      return { title: m.audio_node_random_label, hint: m.audio_node_random_hint };
    case "switch":
      if (node.pick.kind === "firstChild") {
        return { title: m.audio_node_switch_label, hint: m.audio_node_switch_first_hint };
      }
      return { title: m.audio_node_switch_label, hint: m.audio_node_switch_hint };
    case "layer":
      return { title: m.audio_node_layer_label, hint: m.audio_node_layer_hint };
    case "mixer":
      return { title: m.audio_node_mixer_label, hint: m.audio_node_mixer_hint };
  }
}

/** Returns the title that the row of `node` names it by: its kind and its decimal ID. */
export function nodeTitle(node: EventNode): string {
  const id = String(node.id);
  switch (node.kind) {
    case "sound":
      return m.audio_node_sound_label({ id });
    case "random":
    case "switch":
    case "layer":
    case "mixer":
      return containerLabels(node).title({ id });
    case "unsupported":
      return m.audio_node_unsupported_label({ kind: node.kindName, id });
    case "missing":
      return m.audio_node_missing_label({ id });
  }
}

function NodeContent({ node }: { node: EventNode }) {
  switch (node.kind) {
    case "sound":
      return (
        <>
          <span className="text-surface-200">{nodeTitle(node)}</span>
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
          <span className="text-surface-200">{nodeTitle(node)}</span>
          <span className="truncate text-meta text-surface-400">
            {containerLabels(node).hint()}
          </span>
        </>
      );
    }
    case "unsupported": {
      const hint = node.music ? m.audio_node_music_hint() : m.audio_node_unsupported_hint();
      return (
        <>
          <span className="text-surface-300">
            {m.audio_node_unsupported_label({ kind: node.kindName, id: String(node.id) })}
          </span>
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

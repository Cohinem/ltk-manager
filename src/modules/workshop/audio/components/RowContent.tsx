import { WarningIcon, XCircleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { m } from "@/i18n";
import type { AudioEvent, EventStatus } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { eventLabel, objectLabel } from "../utils/eventTree";

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

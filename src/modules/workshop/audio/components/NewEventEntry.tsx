import { PlusIcon } from "@phosphor-icons/react";
import { type KeyboardEvent, useState } from "react";

import { Button, ExperimentalChip } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { LINE_FIELD_CLASSES } from "../../bin/tree/components/AddLineFrame";

/** The name entry of a new event: blank, or the name of a copy of the event `copyOf`. */
export interface Naming {
  /** The event that the new event copies, or null for an event with no action. */
  readonly copyOf: number | null;
  readonly initial: string;
}

interface NewEventEntryProps {
  /** The open entry, or null while the press shows. */
  readonly naming: Naming | null;
  readonly onNaming: (naming: Naming | null) => void;
  /** Creates the event. Resolves false if the backend refused the name. */
  readonly onCommit: (name: string, copyOf: number | null) => Promise<boolean>;
}

/**
 * `+ New event` in the toolbar, and the name entry that it opens in its place.
 *
 * Enter creates the event, whose ID is the hash of the name, and Escape or a press outside drops
 * the entry. A refused name keeps the entry open with the text. Duplicate on an event opens the
 * same entry, prefilled. Per "New objects" in docs/ux/AUDIO.md.
 */
export function NewEventEntry({ naming, onNaming, onCommit }: NewEventEntryProps) {
  if (naming === null) {
    return (
      <span className="flex shrink-0 items-center gap-1.5">
        <Button
          variant="ghost"
          size="xs"
          left={<PlusIcon weight="bold" />}
          onClick={() => onNaming({ copyOf: null, initial: "" })}
        >
          {m.audio_events_new_action()}
        </Button>
        <ExperimentalChip />
      </span>
    );
  }

  return (
    <NameField
      key={`${naming.copyOf ?? "new"}:${naming.initial}`}
      naming={naming}
      onClose={() => onNaming(null)}
      onCommit={onCommit}
    />
  );
}

interface NameFieldProps {
  readonly naming: Naming;
  readonly onClose: () => void;
  readonly onCommit: (name: string, copyOf: number | null) => Promise<boolean>;
}

function NameField({ naming, onClose, onCommit }: NameFieldProps) {
  const [text, setText] = useState(naming.initial);
  const [refused, setRefused] = useState(false);

  function commit() {
    const name = text.trim();
    if (name === "") {
      onClose();
      return;
    }

    void onCommit(name, naming.copyOf).then((created) => {
      if (created) onClose();
      else setRefused(true);
    });
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <input
      autoFocus
      data-draft
      aria-label={m.audio_events_new_label()}
      aria-invalid={refused}
      placeholder={m.audio_events_new_placeholder()}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        setRefused(false);
      }}
      onKeyDown={keyDown}
      onBlur={onClose}
      onFocus={(event) => event.currentTarget.select()}
      className={twMerge(
        LINE_FIELD_CLASSES,
        "w-64 shrink-0 font-sans text-row",
        refused && "border-danger focus:border-danger",
      )}
    />
  );
}

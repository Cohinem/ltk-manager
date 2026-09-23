import { CaretDownIcon, CaretUpIcon, MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { Field, IconButton } from "@/components";
import { m } from "@/i18n";

import type { TextFind } from "../useTextFind";

/**
 * Finding text inside a document: the query, the count, and the way through.
 *
 * Per "Finding text in a document" in `docs/ux/PROJECT_EDITOR.md`.
 */
export function TextFindBar({ find }: { find: TextFind }) {
  const count = find.matches.length;
  const empty = find.query.length > 0 && count === 0;

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      find.close();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) find.previous();
      else find.next();
    }
  }

  return (
    <div
      data-ui="TextFindBar"
      /* Chrome over the buffer rather than part of it: DS-GROUND. */
      className="flex shrink-0 items-center gap-1.5 border-b border-surface-700/50 bg-surface-900 px-2 py-1 select-none"
    >
      <Field.Root className="relative min-w-0 flex-1">
        <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-surface-400" />
        <Field.Control
          ref={find.fieldRef}
          type="text"
          value={find.query}
          onChange={(event) => find.setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={m.editor_find_label()}
          aria-label={m.editor_find_label()}
          autoComplete="off"
          spellCheck={false}
          className="h-6 pr-20 pl-7 text-xs select-text"
        />
        {/* Inside the field, because what a query found is the field's own
            answer to what was typed into it. */}
        <span className="absolute top-1/2 right-2 -translate-y-1/2 text-meta text-surface-400 tabular-nums">
          {empty && m.editor_find_empty_label()}
          {count > 0 && m.editor_find_count_label({ index: find.index + 1, count })}
        </span>
      </Field.Root>

      <IconButton
        icon={<CaretUpIcon weight="bold" className="h-3.5 w-3.5" />}
        variant="ghost"
        size="xs"
        compact
        disabled={count === 0}
        onClick={find.previous}
        title={m.editor_find_previous_action()}
        aria-label={m.editor_find_previous_action()}
      />
      <IconButton
        icon={<CaretDownIcon weight="bold" className="h-3.5 w-3.5" />}
        variant="ghost"
        size="xs"
        compact
        disabled={count === 0}
        onClick={find.next}
        title={m.editor_find_next_action()}
        aria-label={m.editor_find_next_action()}
      />
      <IconButton
        icon={<XIcon weight="bold" className="h-3.5 w-3.5" />}
        variant="ghost"
        size="xs"
        compact
        onClick={find.close}
        title={m.editor_find_close_action()}
        aria-label={m.editor_find_close_action()}
      />
    </div>
  );
}

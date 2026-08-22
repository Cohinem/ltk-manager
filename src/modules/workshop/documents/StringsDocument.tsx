import { useEffect, useMemo, useRef } from "react";

import { Button, EmptyState, Spinner } from "@/components";
import { DocumentToolbar, type EditorDocumentProps } from "@/modules/editor";

import { useGameStringValues } from "../api/useGameStringValues";
import { useSetDocumentDirty } from "../state";
import {
  matchesOverrideFilter,
  type OverrideSaveState,
  StringOverridesHelpPopover,
  StringOverridesTable,
  StringOverridesToolbar,
  useStringOverridesEditor,
} from "../string-overrides";
import type { ContentDocumentOf } from "./contentDocument";

/** One layer's string overrides for one locale, saving themselves as edited. */
export function StringsDocument({
  document,
  active,
}: EditorDocumentProps<ContentDocumentOf<"strings">>) {
  const locale = document.locale;
  const editor = useStringOverridesEditor(document.layerName, locale);
  const setDocumentDirty = useSetDocumentDirty();

  const documentId = document.id;
  /* Autosave keeps the document clean on its own. Dirty is reserved for what
     genuinely cannot persist - a validation hold or a failed write - so the
     close guard only ever asks about edits that would really be lost. */
  const unsaved = editor.saveState === "blocked" || editor.saveState === "failed";

  useEffect(() => {
    setDocumentDirty(documentId, unsaved);
  }, [documentId, unsaved, setDocumentDirty]);

  useEffect(() => {
    return () => setDocumentDirty(documentId, false);
  }, [documentId, setDocumentDirty]);

  const saveNow = useRef(editor.saveNow);
  useEffect(() => {
    saveNow.current = editor.saveNow;
  });

  useEffect(() => {
    if (!active) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.key.toLowerCase() !== "s") return;

      event.preventDefault();
      saveNow.current();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active]);

  const originals = useGameStringValues(editor.entries.map((entry) => entry.key)).data;

  const { entries, filter, lastCommittedId } = editor;
  const visible = useMemo(
    () =>
      entries.filter(
        (entry) =>
          entry.id === lastCommittedId ||
          matchesOverrideFilter(entry, originals?.[entry.key], filter),
      ),
    [entries, filter, lastCommittedId, originals],
  );

  return (
    <div data-ui="StringsDocument" className="flex min-h-0 flex-1 flex-col bg-surface-950">
      <DocumentToolbar active={active}>
        <StringOverridesToolbar
          layerName={document.layerName}
          locale={locale}
          filter={editor.filter}
          onFilterChange={editor.setFilter}
          shown={visible.length}
          total={editor.entries.length}
        />
        <SaveStatus state={editor.saveState} onRetry={editor.saveNow} />
        <StringOverridesHelpPopover />
      </DocumentToolbar>

      <div className="min-h-0 flex-1 overflow-hidden p-3">
        <StringOverridesTable
          className="h-full"
          entries={visible}
          originals={originals ?? {}}
          errors={editor.errors}
          emptyState={<NoRows filter={editor.filter} onClearFilter={() => editor.setFilter("")} />}
          onCommitEntry={editor.commitEntry}
          onUpdateEntry={editor.updateEntry}
          onPickSuggestion={editor.pickSuggestion}
          onRemoveEntry={editor.removeEntry}
        />
      </div>
    </div>
  );
}

interface SaveStatusProps {
  state: OverrideSaveState;
  onRetry: () => void;
}

/* Quiet when clean, because saving is the document's job, not an event. The
   states worth a word are the ones holding the author's edits back. */
function SaveStatus({ state, onRetry }: SaveStatusProps) {
  if (state === "pending" || state === "saving") {
    return <Spinner size="sm" className="h-3 w-3 shrink-0" />;
  }

  if (state === "blocked") {
    return (
      /* DS-TEXT */
      <span className="shrink-0 text-[0.6875rem] text-warning-text select-none">
        Fix the errors to save
      </span>
    );
  }

  if (state === "failed") {
    return (
      <span className="flex shrink-0 items-center gap-1.5">
        {/* DS-TEXT */}
        <span className="text-[0.6875rem] text-danger-text select-none">Save failed</span>
        <Button variant="ghost" size="xs" compact onClick={onRetry}>
          Retry
        </Button>
      </span>
    );
  }

  return null;
}

interface NoRowsProps {
  filter: string;
  onClearFilter: () => void;
}

/* Under the composer, which stays: whichever way the list is empty, the way
   forward is right above. */
function NoRows({ filter, onClearFilter }: NoRowsProps) {
  const term = filter.trim();

  if (term.length > 0) {
    return (
      <EmptyState
        size="sm"
        title={`No overrides match "${term}"`}
        action={
          <Button variant="ghost" size="sm" onClick={onClearFilter}>
            Clear filter
          </Button>
        }
      />
    );
  }

  return (
    <EmptyState
      size="sm"
      title="No overrides yet"
      description="Pick a field above and type what it should say. Search by name, or by what the text says in game."
    />
  );
}

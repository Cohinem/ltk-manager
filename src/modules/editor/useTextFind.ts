import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Where one match sits in the text, as a selection would say it. */
export interface TextMatch {
  start: number;
  end: number;
}

/**
 * Every match of `query` in `text`, in reading order.
 *
 * Case-insensitive and plain: the query is text to find rather than a pattern,
 * which is what a `.modignore` or a readme is searched for. Matches never
 * overlap, so a search for `aa` in `aaa` finds one.
 */
export function findMatches(text: string, query: string): readonly TextMatch[] {
  if (query.length === 0) return [];

  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  const matches: TextMatch[] = [];

  let from = 0;
  for (;;) {
    const start = haystack.indexOf(needle, from);
    if (start < 0) return matches;

    matches.push({ start, end: start + needle.length });
    from = start + needle.length;
  }
}

export interface TextFind {
  /** The bar is on screen. */
  open: boolean;
  query: string;
  setQuery: (query: string) => void;
  matches: readonly TextMatch[];
  /** Which match the bar is sitting on, and -1 while nothing matches. */
  index: number;
  /** The next match, wrapping at the end. */
  next: () => void;
  /** The previous match, wrapping at the start. */
  previous: () => void;
  /** Open the bar and take the caret, which is what `Ctrl+F` asks for. */
  reveal: () => void;
  /** Close the bar and hand the caret back to the text. */
  close: () => void;
  /** The bar's own field. */
  fieldRef: RefObject<HTMLInputElement | null>;
  /** The buffer the matches are in, which a close hands the caret back to. */
  bufferRef: RefObject<HTMLTextAreaElement | null>;
}

/** Finding text inside one buffer, per "Finding text in a document" in `docs/ux/PROJECT_EDITOR.md`. */
export function useTextFind(text: string): TextFind {
  const [open, setOpen] = useState(false);
  const [query, setQueryState] = useState("");
  const [cursor, setCursor] = useState(0);

  const fieldRef = useRef<HTMLInputElement>(null);
  const bufferRef = useRef<HTMLTextAreaElement>(null);

  const matches = useMemo(() => findMatches(text, query), [text, query]);

  /* An edit under the bar can leave the cursor past the end of what is left, so
     the mark on screen is clamped rather than the state behind it. */
  const index = matches.length === 0 ? -1 : Math.min(cursor, matches.length - 1);

  const setQuery = useCallback((next: string) => {
    setQueryState(next);
    /* A new query is a new question, so it is answered from the first match. */
    setCursor(0);
  }, []);

  const step = useCallback(
    (delta: number) => {
      if (matches.length === 0) return;
      setCursor((index + delta + matches.length) % matches.length);
    },
    [index, matches.length],
  );

  const reveal = useCallback(() => {
    setOpen(true);
    /* A fresh open takes the caret in the effect below, once the field is
       mounted. Already open, the key means this query again, which is this. */
    fieldRef.current?.select();
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    bufferRef.current?.focus();
  }, []);

  useEffect(() => {
    if (open) fieldRef.current?.select();
  }, [open]);

  return {
    open,
    query,
    setQuery,
    matches,
    index,
    next: () => step(1),
    previous: () => step(-1),
    reveal,
    close,
    fieldRef,
    bufferRef,
  };
}

/** The shell's stack of stops, apart from the editors those stops point into. */
export interface NavigationStack {
  /**
   * Where the user has been across the shell, oldest first.
   *
   * One stack rather than one per project, so the arrows walk out of a project
   * the same way they walk between its tabs. Session-only: `.ltk/editor.json`
   * holds where a user left a project, and a history is how they got there.
   */
  readonly history: readonly HistoryEntry[];
  /** Where in `history` the arrows stand. -1 while nothing has been visited. */
  readonly historyIndex: number;
}

/**
 * One stop on the shell's navigation history.
 *
 * The stack spans the workshop rather than one project, so a stop names where
 * it was as well as what it was. The group is not recorded, because a document
 * sits in exactly one of them and `leafHolding` answers which. A position
 * inside the document is not recorded either, so a back restores which document
 * and leaves the rest to it.
 */
export type HistoryEntry =
  | { readonly kind: "list" }
  | {
      readonly kind: "document";
      /** The path of the project holding it, which is what the arrows route to. */
      readonly project: string;
      readonly documentId: string;
      /**
       * Where an explorer document was standing, absent for every other kind.
       *
       * A tab is one stop and a directory inside it is another, so the arrows
       * walk the folders a reader opened and not only the tabs.
       */
      readonly location?: ExplorerStop;
    };

/** One explorer, and the directory it was showing. */
export interface ExplorerStop {
  readonly explorerId: string;
  readonly path: string;
}

/** How far back the arrows reach before the oldest stop is dropped. */
const HISTORY_LIMIT = 50;

/**
 * Push a stop, or leave the stack standing where it is.
 *
 * Landing again on the stop the arrows already stand on records nothing, which
 * is what keeps a re-activate of the open tab, and a return to the list a back
 * already reached, out of the stack.
 */
export function pushStop(stack: NavigationStack, entry: HistoryEntry): NavigationStack | null {
  if (sameStop(stack.history[stack.historyIndex], entry)) return null;

  /* A move after a back drops the forward part, the way a browser does. */
  const history = stack.history.slice(0, stack.historyIndex + 1);
  history.push(entry);
  if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT);

  return { history, historyIndex: history.length - 1 };
}

/** Whether this stop is the named tab's, standing at no directory of it yet. */
function isBareStopOf(entry: HistoryEntry | undefined, project: string, documentId: string) {
  return (
    entry?.kind === "document" &&
    entry.project === project &&
    entry.documentId === documentId &&
    entry.location === undefined
  );
}

/**
 * Complete the tab's own bare stop with this directory, or stand beside it.
 *
 * The stop a tab's open records names no directory, so the first directory it
 * reports fills that stop in rather than standing behind it as a second one a
 * back would have to step over.
 */
export function placeStop(
  stack: NavigationStack,
  entry: Extract<HistoryEntry, { kind: "document" }>,
): NavigationStack {
  if (!isBareStopOf(stack.history[stack.historyIndex], entry.project, entry.documentId)) {
    return pushStop(stack, entry) ?? stack;
  }

  const history = [...stack.history];
  history[stack.historyIndex] = entry;
  return { history, historyIndex: stack.historyIndex };
}

function sameStop(a: HistoryEntry | undefined, b: HistoryEntry): boolean {
  if (a === undefined) return false;
  if (a.kind === "list" || b.kind === "list") return a.kind === b.kind;
  if (a.project !== b.project || a.documentId !== b.documentId) return false;

  /* A stop naming no directory is the tab wherever it stands, so an activate of
     the tab a stop already names is the stop it already names. Comparing the
     two as different put a second stop on the tab that a back then had to step
     over, which reads as an arrow that did nothing. */
  if (a.location === undefined || b.location === undefined) return true;

  return a.location.explorerId === b.location.explorerId && a.location.path === b.location.path;
}

/** Drop the stops a predicate names, keeping the arrows inside what is left. */
export function dropStops(
  stack: NavigationStack,
  gone: (entry: HistoryEntry) => boolean,
): NavigationStack | null {
  if (!stack.history.some(gone)) return null;

  const history: HistoryEntry[] = [];
  let index = stack.historyIndex;
  stack.history.forEach((entry, at) => {
    if (!gone(entry)) {
      history.push(entry);
      return;
    }
    if (at <= stack.historyIndex) index -= 1;
  });

  return { history, historyIndex: Math.max(-1, Math.min(index, history.length - 1)) };
}

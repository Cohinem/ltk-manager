import type { ContentDocument } from "../../documents/utils/contentDocument";
import type { ClosedTab } from "./closedTabs";
import type { NavigationStack } from "./navigationStack";
import type { ProjectEditor } from "./projectEditor";

/**
 * The state every action here writes: the editors, and the lists spanning them.
 *
 * An action works inside one project's slice and tags what it did, and the
 * folds in `projectUpdate` write the two lists from those tags. Named apart
 * from the store so a group of actions states what it reads rather than
 * reaching for the whole surface.
 */
export interface EditorRoot extends NavigationStack {
  /** Editor state per project path, so switching projects keeps every set. */
  readonly byProject: Record<string, ProjectEditor>;
  /**
   * What the shell closed, newest first, bounded to a short run.
   *
   * One list rather than one per project, for the reason the history is one:
   * session-only state, which a project's own file has no business holding. A
   * batch close records its tabs in strip order, so a run of reopens rebuilds
   * the strip the way it read.
   */
  readonly closed: readonly ClosedTab[];
  /**
   * A document each project's editor opens as soon as it is hydrated.
   *
   * Outside `byProject`, because an entry there is what tells
   * `useEditorPersistence` the editor is already held, and an open written
   * before the file is read would cost the user every tab it holds.
   */
  readonly pendingDocuments: Readonly<Record<string, ContentDocument>>;
}

/** How a group of actions writes the state, which is zustand's own `set`. */
export type EditorSet = (
  next: Partial<EditorRoot> | ((state: EditorRoot) => EditorRoot | Partial<EditorRoot>),
) => void;

/** How a group of actions reads the state, which is zustand's own `get`. */
export type EditorGet = () => EditorRoot;

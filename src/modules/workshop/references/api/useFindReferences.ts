import { useCallback } from "react";

import { referencesDocument } from "../../documents/utils/contentDocument";
import { useOptionalProjectContext } from "../../projects/state/ProjectContext";
import { type ReferenceQuestion, useAskReferences, useOpenDocument } from "../../state";

/** Every object of one class, labelled by the class name or its hash. */
export function classReferences(classHash: string, name: string | null): ReferenceQuestion {
  return { query: { kind: "class", classHash }, label: name ?? classHash };
}

/** Every `pointer` and `embed` value of one class, labelled by the class name or its hash. */
export function embeddedReferences(classHash: string, name: string | null): ReferenceQuestion {
  return { query: { kind: "embedded", classHash }, label: name ?? classHash };
}

/** Every value linking to one object, labelled by the object's path. */
export function objectReferences(objectHash: string, objectPath: string): ReferenceQuestion {
  return { query: { kind: "object", objectHash }, label: objectPath };
}

/** Every value naming one file, labelled by its chunk path. */
export function fileReferences(path: string): ReferenceQuestion {
  return { query: { kind: "file", path }, label: path };
}

/** Every `file` value naming one chunk no table names, labelled by its path hash. */
export function chunkReferences(pathHash: string): ReferenceQuestion {
  return { query: { kind: "chunk", pathHash }, label: pathHash };
}

/**
 * Open the References document on a new question, which replaces the last.
 *
 * "The References document" in docs/ux/PROJECT_EDITOR.md. Every Find references item comes
 * through here, and the open project is the one whose layers a walk reads.
 */
export function useFindReferences(): (question: ReferenceQuestion) => void {
  const openDocument = useOpenDocument();
  const ask = useAskReferences();
  const project = useOptionalProjectContext()?.path ?? null;

  return useCallback(
    (question) => {
      ask({ ...question, project });
      openDocument(referencesDocument());
    },
    [ask, openDocument, project],
  );
}

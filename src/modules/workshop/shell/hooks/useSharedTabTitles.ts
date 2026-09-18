import { useMemo } from "react";

import { sharedTitles } from "@/modules/editor";

import { documentDefinition, useContentEditors } from "../../documents";
import { useOpenDocuments } from "./useProjectEditor";

/**
 * The titles more than one open tab of this project carries.
 *
 * Every group at once. A split shows two strips a user reads together.
 */
export function useSharedTabTitles(): ReadonlySet<string> {
  const documents = useOpenDocuments();
  const editors = useContentEditors();

  return useMemo(
    () =>
      sharedTitles(
        documents.flatMap(
          (document) => documentDefinition(editors, document)?.label(document).title ?? [],
        ),
      ),
    [documents, editors],
  );
}

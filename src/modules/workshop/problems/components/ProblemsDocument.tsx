import { useMemo, useState } from "react";

import { DocumentToolbar, type EditorDocumentProps, useFindBox } from "@/modules/editor";

/* The document type rather than the barrel, which reaches back here for the
   component this file exports. */
import type { ContentDocumentOf } from "../../documents/utils/contentDocument";
import { filterProblems } from "../utils/problemGroups";
import { useObjectNames, useShownProblems } from "../utils/runCatalogue";
import { AheadToggle } from "./AheadToggle";
import { ProblemsActions } from "./ProblemsActions";
import { ProblemsCount } from "./ProblemsCount";
import { ProblemsList } from "./ProblemsList";
import { ProblemsToolbar } from "./ProblemsToolbar";

/** Everything the manager's checks found in this project, in a tab of its own. */
export function ProblemsDocument({
  document,
  active,
}: EditorDocumentProps<ContentDocumentOf<"problems">>) {
  const [query, setQuery] = useState("");
  const boxRef = useFindBox(document.id);

  /* Counted here and filtered again in the list. The two are the same call over
     the same memoized run, and threading the result down would tie the list's
     shape to whoever hosts it. */
  const names = useObjectNames();
  const problems = useShownProblems();
  const shown = useMemo(
    () => filterProblems(problems, query, names).length,
    [problems, query, names],
  );

  return (
    <div data-ui="ProblemsDocument" className="flex min-h-0 flex-1 flex-col bg-surface-950">
      <DocumentToolbar active={active}>
        <ProblemsToolbar
          query={query}
          onQueryChange={setQuery}
          shown={shown}
          total={problems.length}
          boxRef={boxRef}
        />
        <ProblemsCount />
        <ProblemsActions />
      </DocumentToolbar>

      <AheadToggle />

      <div className="min-h-0 flex-1 overflow-hidden p-3">
        <ProblemsList query={query} />
      </div>
    </div>
  );
}

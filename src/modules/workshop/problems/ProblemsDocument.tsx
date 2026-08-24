import { useMemo, useState } from "react";

import { DocumentToolbar, type EditorDocumentProps } from "@/modules/editor";

/* The document type rather than the barrel, which reaches back here for the
   component this file exports. */
import type { ContentDocumentOf } from "../documents/contentDocument";
import { AheadToggle } from "./AheadToggle";
import { filterProblems } from "./problemGroups";
import { ProblemsActions } from "./ProblemsActions";
import { ProblemsCount } from "./ProblemsCount";
import { ProblemsList } from "./ProblemsList";
import { ProblemsToolbar } from "./ProblemsToolbar";
import { useObjectNames, useShownProblems } from "./runCatalogue";

/** Everything the manager's checks found in this project, in a tab of its own. */
export function ProblemsDocument({ active }: EditorDocumentProps<ContentDocumentOf<"problems">>) {
  const [query, setQuery] = useState("");

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

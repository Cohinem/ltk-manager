import { SeverityGlyph, Tooltip, worstOf } from "@/components";
import type { Problem } from "@/lib/tauri";

import { useProjectProblems } from "../../api";
import { useOptionalProjectContext } from "../../projects/state/ProjectContext";
import { countBySeverity } from "../utils/problemGroups";

/**
 * The worst severity among `problems`, as a glyph on a file, directory or bin row.
 *
 * The tooltip lists the title of each rule that reported one of `problems`. Draws nothing for
 * an empty list. Read the list with `useProblemsAt`.
 */
export function ProblemMark({ problems }: { problems: readonly Problem[] }) {
  const project = useOptionalProjectContext();
  const { data: run } = useProjectProblems(project?.path);

  if (problems.length === 0) return null;

  const titles = [...new Set(problems.map((problem) => problem.rule))].map(
    (rule) => run?.rules.find((info) => info.id === rule)?.title ?? rule,
  );

  return (
    <Tooltip
      content={
        <span className="flex flex-col">
          {titles.map((title) => (
            <span key={title}>{title}</span>
          ))}
        </span>
      }
    >
      <span role="img" aria-label={titles.join(", ")} className="flex shrink-0">
        <SeverityGlyph severity={worstOf(countBySeverity(problems))} />
      </span>
    </Tooltip>
  );
}

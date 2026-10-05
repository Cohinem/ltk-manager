import { ArrowsClockwiseIcon, WrenchIcon } from "@phosphor-icons/react";

import { IconButton } from "@/components";

import { useFixProblems, useProjectProblems } from "../../api";
import { useProjectContext } from "../../projects/state/ProjectContext";
import { useShownProblems } from "../utils/runCatalogue";

/** Re-run the checks and repair the whole project. */
export function ProblemsActions() {
  const project = useProjectContext();
  const { isFetching, refetch } = useProjectProblems(project.path);
  const fix = useFixProblems();

  /* What is on screen, so the panel's Fix reaches exactly the rows a reader
     can see. A scope that quietly stopped short of one would leave it broken
     and say it was done. */
  const fixable = useShownProblems().filter((problem) => problem.fix);

  function handleFix() {
    fix.mutate({
      projectPath: project.path,
      problems: fixable.map((problem) => problem.id),
    });
  }

  return (
    <>
      {fixable.length > 0 && (
        <IconButton
          icon={<WrenchIcon />}
          loading={fix.isPending}
          onClick={handleFix}
          label={fixTip(fixable.length)}
        />
      )}

      <IconButton
        icon={<ArrowsClockwiseIcon className={isFetching ? "animate-spin" : undefined} />}
        onClick={() => void refetch()}
        label="Check the project again"
      />
    </>
  );
}

/* A fix reaches every layer, because a mod is every layer it ships. */
function fixTip(count: number) {
  if (count === 1) return "Fix 1 problem across the project";
  return `Fix ${count} problems across the project`;
}

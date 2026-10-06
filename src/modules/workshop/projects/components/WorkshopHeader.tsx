import { ChromePortal, Inline } from "@/components";

import { ContentLayoutPopover } from "../../content/components/ContentLayoutPopover";
import { WorkshopBar } from "../../palette/components/WorkshopBar";
import { ProblemsBadge } from "../../problems";
import { useOptionalProjectContext } from "../state/ProjectContext";
import { ProjectActions } from "./ProjectActions";
import { NewProjectButton } from "./WorkshopControls";

/**
 * The workshop's chrome over both of its surfaces: the bar in the title bar, with New project
 * in its field or the layout popover behind it, and a project's badge and run actions at the end
 * of the status row.
 *
 * Per "Layout" in docs/ux/WORKSHOP.md. Opening a project refills the slots rather than
 * swapping the chrome.
 */
export function WorkshopHeader() {
  return (
    <>
      <WorkshopBar actions={<CreateSlot />} trailing={<LayoutSlot />} />

      <RunSlot />
    </>
  );
}

function CreateSlot() {
  const project = useOptionalProjectContext();

  if (project) return null;
  return <NewProjectButton />;
}

function LayoutSlot() {
  const project = useOptionalProjectContext();

  /* Layout is view-level, so it sits here once rather than in every leaf's tab strip. */
  if (!project) return null;
  return <ContentLayoutPopover />;
}

/* Filled under a project alone, so the status row draws for the list only when it has a line of its own. */
function RunSlot() {
  const project = useOptionalProjectContext();

  if (!project) return null;

  return (
    <ChromePortal slot="status">
      <Inline gap={1} data-ui="WorkshopHeader:actions">
        <ProblemsBadge />
        <ProjectActions project={project} />
      </Inline>
    </ChromePortal>
  );
}

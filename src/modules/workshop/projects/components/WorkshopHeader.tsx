import { ChromePortal, Inline } from "@/components";

import { ContentLayoutPopover } from "../../content/components/ContentLayoutPopover";
import { WorkshopBar } from "../../palette/components/WorkshopBar";
import { ProblemsBadge } from "../../problems";
import { useOptionalProjectContext } from "../state/ProjectContext";
import { ProjectActions } from "./ProjectActions";
import { WorkshopActions, WorkshopViewControls } from "./WorkshopControls";

/**
 * The workshop's chrome over both of its surfaces: the bar in the title bar, and the badge,
 * the view controls and the actions at the end of the status row.
 *
 * Per "Layout" in docs/ux/WORKSHOP.md. Opening a project refills the slots rather than
 * swapping the chrome.
 */
export function WorkshopHeader() {
  return (
    <>
      <WorkshopBar />

      <ChromePortal slot="status">
        <Inline gap={1} data-ui="WorkshopHeader:actions">
          <BadgeSlot />
          <ViewSlot />
          <ActionSlot />
        </Inline>
      </ChromePortal>
    </>
  );
}

function BadgeSlot() {
  const project = useOptionalProjectContext();

  if (!project) return null;
  return <ProblemsBadge />;
}

function ViewSlot() {
  const project = useOptionalProjectContext();

  /* Layout is view-level, so it sits here once rather than in every leaf's tab strip. */
  if (project) return <ContentLayoutPopover />;
  return <WorkshopViewControls />;
}

function ActionSlot() {
  const project = useOptionalProjectContext();

  if (!project) return <WorkshopActions />;
  return <ProjectActions project={project} />;
}

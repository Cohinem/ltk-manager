import { CaretDownIcon, CheckSquareIcon, PlayIcon } from "@phosphor-icons/react";
import { match } from "ts-pattern";

import { Button, ButtonGroup, IconButton, Kbd, Menu, Tooltip } from "@/components";
import { useActiveProfile } from "@/modules/library";

import { testTint } from "../../shared/utils/actionTints";
import { useWorkshopSelectionStore } from "../../state";
import { useWorkshopTestState } from "../../testing/api/useWorkshopTestState";
import { BuildingTestButton, StopTestButton } from "../../testing/components/testSessionButtons";
import { useFilteredProjects } from "../hooks/useFilteredProjects";
import { useProjectSelectionActions } from "../hooks/useProjectSelectionActions";
import { ProjectSelectionMenuItems } from "./ProjectCardMenuItems";

/**
 * Selects every visible project on click, and holds the bulk actions on its caret.
 *
 * Per "Selection, and a running session" in `docs/ux/WORKSHOP.md`.
 */
export function WorkshopSelectionButton() {
  const selectedPaths = useWorkshopSelectionStore((s) => s.selectedPaths);
  const selectAll = useWorkshopSelectionStore((s) => s.selectAll);
  const clear = useWorkshopSelectionStore((s) => s.clear);

  const filteredProjects = useFilteredProjects();
  const actions = useProjectSelectionActions();
  const testState = useWorkshopTestState();
  const { data: activeProfile } = useActiveProfile();

  const selectedCount = selectedPaths.size;
  const hasSelection = selectedCount > 0;
  const testing = testState.kind !== "idle";
  const allSelected =
    filteredProjects.length > 0 && filteredProjects.every((p) => selectedPaths.has(p.path));
  // A selection survives a filter change, so an empty result still has something to clear.
  const clearsOnClick = allSelected || filteredProjects.length === 0;
  /* A test layers the selection over the active profile's enabled mods, and the
     workshop no longer draws that profile anywhere else, so it is named where
     the run is started. */
  const testTooltip = hasSelection
    ? `Test ${selectedCount} selected project${
        selectedCount === 1 ? "" : "s"
      } over the ${activeProfile?.name ?? "Default"} profile`
    : "Select projects to test them in game";

  function handleToggleAll() {
    if (clearsOnClick) {
      clear();
      return;
    }
    selectAll(filteredProjects.map((p) => p.path));
  }

  /* Named with no project, so `useWorkshopTestState`'s "other" is simply the
     session the grid started - there is no this-project for it to be other
     than. */
  const testButton = match(testState)
    .with({ kind: "idle" }, () => (
      <Tooltip content={testTooltip}>
        <Button
          variant="ghost"
          left={<PlayIcon weight="bold" className="size-4" />}
          loading={actions.testPending}
          disabled={!actions.canTest}
          onClick={actions.test}
          className={testTint}
        >
          Test
        </Button>
      </Tooltip>
    ))
    .with({ kind: "building-this" }, { kind: "building-other" }, () => <BuildingTestButton />)
    .with({ kind: "running-this" }, { kind: "running-other" }, () => <StopTestButton />)
    .with({ kind: "building-library" }, { kind: "running-library" }, () => (
      <Tooltip content="The mod library is testing - stop it there first">
        <Button
          variant="ghost"
          disabled
          left={<PlayIcon weight="bold" className="size-4" />}
          className={testTint}
        >
          Test
        </Button>
      </Tooltip>
    ))
    .exhaustive();

  return (
    <ButtonGroup>
      <IconButton
        icon={<CheckSquareIcon />}
        variant="outline"
        size="md"
        disabled={testing || (filteredProjects.length === 0 && !hasSelection)}
        pressed={hasSelection}
        aria-label={clearsOnClick ? "Clear selection" : "Select all projects"}
        onClick={handleToggleAll}
        tooltip={
          <>
            {clearsOnClick ? "Clear selection" : "Select all"} <Kbd shortcut="Ctrl+A" />
          </>
        }
      />
      {testButton}

      {hasSelection && (
        <Menu.Root>
          <Menu.Trigger
            render={
              <IconButton
                icon={<CaretDownIcon />}
                variant="outline"
                size="md"
                aria-label="Bulk actions"
                narrow
              />
            }
          />
          <Menu.Content className="w-56">
            <ProjectSelectionMenuItems />
          </Menu.Content>
        </Menu.Root>
      )}
    </ButtonGroup>
  );
}

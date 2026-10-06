import { PlayIcon } from "@phosphor-icons/react";
import { match } from "ts-pattern";

import { Button, Tooltip } from "@/components";
import { m } from "@/i18n";
import { useActiveProfile } from "@/modules/library";

import { testTint } from "../../shared/utils/actionTints";
import { useWorkshopTestState } from "../../testing/api/useWorkshopTestState";
import { BuildingTestButton, StopTestButton } from "../../testing/components/testSessionButtons";
import { useProjectSelectionActions } from "../hooks/useProjectSelectionActions";

/**
 * The list's Test, floating over the bottom right corner of the list it is drawn in.
 *
 * Positioned against the nearest positioned ancestor, which the list's route provides.
 * Per "Selection, and a running session" in `docs/ux/WORKSHOP.md`.
 */
export function WorkshopTestDock() {
  return (
    <div
      data-ui="WorkshopTestDock"
      /* DS-GROUND: floats over the island's card. */
      className="absolute right-1 bottom-1 z-10 flex rounded-lg border border-surface-600 bg-surface-800 p-1 shadow-lg select-none"
    >
      <WorkshopTestButton />
    </div>
  );
}

/** Tests the picked projects, and ends the session that test started. */
function WorkshopTestButton() {
  const actions = useProjectSelectionActions();
  const testState = useWorkshopTestState();
  const { data: activeProfile } = useActiveProfile();

  /* Named with no project, so `useWorkshopTestState`'s "other" is simply the
     session the list started - there is no this-project for it to be other
     than. */
  return match(testState)
    .with({ kind: "idle" }, () => (
      <Tooltip content={testHint(actions.count, activeProfile?.name)}>
        <Button
          variant="ghost"
          size="sm"
          left={<PlayIcon weight="bold" className="size-3.5" />}
          loading={actions.testPending}
          disabled={!actions.canTest}
          onClick={actions.test}
          className={testTint}
        >
          {m.workshop_header_test_action()}
        </Button>
      </Tooltip>
    ))
    .with({ kind: "building-this" }, { kind: "building-other" }, () => <BuildingTestButton />)
    .with({ kind: "running-this" }, { kind: "running-other" }, () => <StopTestButton />)
    .with({ kind: "building-library" }, { kind: "running-library" }, () => (
      <Tooltip content={m.workshop_list_test_library_hint()}>
        <Button
          variant="ghost"
          size="sm"
          disabled
          left={<PlayIcon weight="bold" className="size-3.5" />}
          className={testTint}
        >
          {m.workshop_header_test_action()}
        </Button>
      </Tooltip>
    ))
    .exhaustive();
}

/* A test layers the picks over the active profile's enabled mods, and the workshop
   draws that profile nowhere else, so it is named where the run is started. */
function testHint(count: number, profile: string | undefined): string {
  if (count === 0) return m.workshop_list_test_empty_hint();

  return m.workshop_list_test_hint({
    count,
    profile: profile ?? m.workshop_list_default_profile_label(),
  });
}

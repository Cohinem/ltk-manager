import {
  DotsThreeVerticalIcon,
  PackageIcon,
  PlayIcon,
  StopIcon,
  XIcon,
} from "@phosphor-icons/react";
import { type ReactElement, type ReactNode, useState } from "react";
import { match } from "ts-pattern";

import { Chip, ContextMenu, IconButton, Menu } from "@/components";
import { m } from "@/i18n";
import type { WorkshopProject } from "@/lib/tauri";
import { ChampionChip } from "@/modules/champions";
import { getTagLabel } from "@/modules/library";
import { useStopPatcher } from "@/modules/patcher";
import { useSettings } from "@/modules/settings";
import { usePatcherSessionStore } from "@/stores";
import { twMerge } from "@/utils";

import { useWorkshopSelectionStore } from "../../state";
import { useWorkshopTestState } from "../../testing/api/useWorkshopTestState";
import { useProjectActions } from "../hooks/useProjectActions";
import { ProjectCardMenuItems, ProjectSelectionMenuItems } from "./ProjectCardMenuItems";

/** Which commands a project's right click opens: its own, or the selection's. */
export type MenuScope = "card" | "selection";

/**
 * Which commands a project's right click opens, decided before the pick moves under it.
 *
 * One picked project and this one are the same target, so its own menu is what
 * opens there - the richer of the two, and the only way to reach Rename.
 */
export function useProjectMenuScope(project: WorkshopProject) {
  const selected = useWorkshopSelectionStore((s) => s.selectedPaths.has(project.path));
  const selectedCount = useWorkshopSelectionStore((s) => s.selectedPaths.size);
  const selectOnly = useWorkshopSelectionStore((s) => s.selectOnly);
  const isPatcherActive = useWorkshopTestState(project).kind !== "idle";
  const [scope, setScope] = useState<MenuScope>("card");

  function onContextMenu() {
    if (selected && selectedCount > 1) {
      setScope("selection");
      return;
    }
    setScope("card");
    /* A session holds the files it was started over, and that set is not the
       user's to rewrite until it ends: "Selection, and a running session". */
    if (selected || isPatcherActive) return;
    selectOnly(project.path);
  }

  return { scope, onContextMenu };
}

/**
 * A project's menu on its right click, over the whole card or row rather than a target.
 *
 * A press inside the selection opens what the selection carries, and a press
 * outside it collapses the pick onto this project and opens its own. Per "The
 * card" in `docs/ux/WORKSHOP.md`.
 *
 * Renders the card or row itself through `render`, so the trigger is that
 * element and its parent keeps addressing it by position.
 */
export function ProjectCardContextMenu({
  card,
  scope,
  project,
  onEdit,
  children,
}: {
  card: ReactElement;
  scope: MenuScope;
  project: WorkshopProject;
  onEdit: (project: WorkshopProject) => void;
  children: ReactNode;
}) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger render={card}>{children}</ContextMenu.Trigger>
      <ContextMenu.Content>
        {scope === "selection" && <ProjectSelectionMenuItems />}
        {scope === "card" && <ProjectCardMenuItems project={project} onEdit={onEdit} />}
      </ContextMenu.Content>
    </ContextMenu.Root>
  );
}

/** A project's kebab, the same menu its right click opens. */
export function ProjectKebab({
  project,
  onEdit,
  reveal,
  className,
}: {
  project: WorkshopProject;
  onEdit: (project: WorkshopProject) => void;
  reveal?: boolean;
  className?: string;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <IconButton
            icon={<DotsThreeVerticalIcon />}
            size="md"
            aria-label={m.workshop_card_options_label({ name: project.displayName })}
            reveal={reveal}
            className={className}
          />
        }
      />
      <Menu.Content>
        <ProjectCardMenuItems project={project} onEdit={onEdit} />
      </Menu.Content>
    </Menu.Root>
  );
}

/** The pill on a project testing right now, which ends the run. */
export function TestingPill() {
  const stopPatcher = useStopPatcher();
  const stopping = usePatcherSessionStore((s) => s.stopping);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        stopPatcher.mutate();
      }}
      disabled={stopping}
      title={m.workshop_card_stop_test_label()}
      className="group/pill flex shrink-0 cursor-pointer items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success-text transition-colors hover:bg-success/20 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {m.workshop_card_testing_label()}
      <XIcon weight="bold" className="size-3 opacity-60 group-hover/pill:opacity-100" />
    </button>
  );
}

/**
 * A project's Test and Pack as icons, for a table row.
 *
 * Test walks the states a project's own Test does: building, Stop Test while
 * this project runs, and disabled while another session holds the patcher.
 */
export function ProjectRunIcons({ project }: { project: WorkshopProject }) {
  const testState = useWorkshopTestState(project);
  const stopPatcher = useStopPatcher();
  const isStopping = usePatcherSessionStore((s) => s.stopping);
  const actions = useProjectActions(project);

  const test = match(testState)
    .with({ kind: "idle" }, () => (
      <IconButton
        icon={<PlayIcon />}
        size="sm"
        label={m.workshop_card_test_action()}
        loading={actions.isTesting}
        onClick={actions.handleTestProject}
      />
    ))
    .with({ kind: "building-this" }, () => (
      <IconButton icon={<PlayIcon />} size="sm" label={m.workshop_card_building_label()} loading />
    ))
    .with({ kind: "running-this" }, () => (
      <IconButton
        icon={<StopIcon weight="fill" />}
        size="sm"
        label={m.workshop_card_stop_test_action()}
        loading={isStopping}
        disabled={isStopping}
        onClick={() => stopPatcher.mutate()}
        className="text-success-text hover:bg-success/15"
      />
    ))
    .with({ kind: "building-other" }, { kind: "running-other" }, ({ otherLabel }) => (
      <IconButton
        icon={<PlayIcon />}
        size="sm"
        label={m.workshop_card_test_action()}
        tooltip={m.workshop_card_test_blocked_hint({ name: otherLabel })}
        disabled
      />
    ))
    .with({ kind: "building-library" }, { kind: "running-library" }, () => (
      <IconButton
        icon={<PlayIcon />}
        size="sm"
        label={m.workshop_card_test_action()}
        tooltip={m.workshop_card_test_patcher_hint()}
        disabled
      />
    ))
    .exhaustive();

  return (
    <>
      {test}
      <IconButton
        icon={<PackageIcon />}
        size="sm"
        label={actions.isPacking ? m.workshop_pack_packing_label() : m.workshop_pack_action()}
        loading={actions.isPacking}
        onClick={actions.handlePack}
      />
    </>
  );
}

/**
 * A project's tag and champion pills, the first `max` of them and a count of the rest.
 *
 * `always` draws them whatever the card display's Tags setting says, as a table column does.
 */
export function ProjectPills({
  project,
  max,
  always = false,
  className,
}: {
  project: WorkshopProject;
  max: number;
  always?: boolean;
  className?: string;
}) {
  const { data: settings } = useSettings();

  const pills = [
    ...project.tags.map((value) => ({ value, kind: "tag" as const })),
    ...project.champions.map((value) => ({ value, kind: "champion" as const })),
  ];
  if (pills.length === 0) return null;
  if (!always && settings && !settings.showModTags) return null;

  const visible = pills.slice(0, max);
  const overflow = pills.length - max;

  return (
    <div className={twMerge("flex flex-wrap items-center gap-1", className)}>
      {visible.map((pill) => {
        if (pill.kind === "champion") {
          return <ChampionChip key={`champion:${pill.value}`} value={pill.value} />;
        }

        return (
          <Chip key={`tag:${pill.value}`} tone="tag">
            {getTagLabel(pill.value)}
          </Chip>
        );
      })}
      {overflow > 0 && (
        <span className="text-fine text-surface-500">
          {m.workshop_card_pills_overflow_label({ count: overflow })}
        </span>
      )}
    </div>
  );
}

/** An opened folder's path, truncated from the left so the folder name, which tells two apart, stays. */
export function OpenedFolderPath({
  project,
  className,
}: {
  project: WorkshopProject;
  className?: string;
}) {
  if (project.location !== "opened") return null;

  return (
    <span
      title={project.path}
      className={twMerge(
        "min-w-0 truncate text-left font-mono text-code select-text [direction:rtl]",
        className,
      )}
    >
      <bdi>{project.path}</bdi>
    </span>
  );
}

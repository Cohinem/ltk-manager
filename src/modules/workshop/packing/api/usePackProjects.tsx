import { useCallback } from "react";

import { useToast } from "@/components";
import { errorSummary, m } from "@/i18n";
import {
  api,
  type PackFormat,
  type PackResult,
  revealPath,
  type WorkshopProject,
} from "@/lib/tauri";

import { ignoreRulesDocument } from "../../documents";
import {
  packFormats,
  usePackRunsStore,
  usePackTargetStore,
  useWorkshopEditorStore,
} from "../../state";

const LISTED_LINES = 3;

/** How one project's pack ended. */
export type PackOutcome =
  | { kind: "packed"; results: PackResult[]; warnings: string[] }
  | { kind: "refused"; errors: string[] }
  | { kind: "failed"; error: string };

/**
 * Pack `project` to each of `formats` after the pre-flight check, stopping at the first failure.
 *
 * The check runs fresh rather than from the cache, because the files have usually changed
 * since anything last read it.
 */
export async function packProject(
  project: WorkshopProject,
  formats: PackFormat[],
): Promise<PackOutcome> {
  const validation = await api.validateProject(project.path);
  if (!validation.ok) return { kind: "failed", error: errorSummary(validation.error) };
  if (validation.value.errors.length > 0) {
    return { kind: "refused", errors: validation.value.errors };
  }

  const results: PackResult[] = [];
  for (const format of formats) {
    const packed = await api.packWorkshopProject({ projectPath: project.path, format });
    if (!packed.ok) return { kind: "failed", error: errorSummary(packed.error) };

    results.push(packed.value);
  }

  return { kind: "packed", results, warnings: validation.value.warnings };
}

/**
 * Pack projects to the remembered target in place, and report each outcome as a toast.
 *
 * A project already packing is skipped. One project reports on its own toast, and several
 * report on one summary toast. Per "Packing" in `docs/ux/PROJECT_EDITOR.md`.
 */
export function usePackProjects() {
  const toast = useToast();

  return useCallback(
    async (projects: WorkshopProject[]) => {
      const { start, finish } = usePackRunsStore.getState();
      const formats = packFormats(usePackTargetStore.getState().target);
      const claimed = new Set(start(projects.map((project) => project.path)));
      const queued = projects.filter((project) => claimed.has(project.path));
      if (queued.length === 0) return;

      const outcomes: Array<{ project: WorkshopProject; outcome: PackOutcome }> = [];
      for (const project of queued) {
        try {
          outcomes.push({ project, outcome: await packProject(project, formats) });
        } finally {
          finish(project.path);
        }
      }

      if (outcomes.length === 1) {
        reportOne(toast, outcomes[0].project, outcomes[0].outcome);
        return;
      }

      reportMany(toast, outcomes);
    },
    [toast],
  );
}

type Toaster = ReturnType<typeof useToast>;

function reportOne(toast: Toaster, project: WorkshopProject, outcome: PackOutcome) {
  const name = project.displayName;

  if (outcome.kind === "refused") {
    toast.toast({
      type: "error",
      title: m.workshop_pack_refused_title({ name }),
      description: <Lines lines={outcome.errors} />,
      timeout: 9000,
    });
    return;
  }

  if (outcome.kind === "failed") {
    toast.toast({
      type: "error",
      title: m.workshop_pack_failed_title({ name }),
      description: outcome.error,
      timeout: 9000,
    });
    return;
  }

  const { results, warnings } = outcome;
  const leftOut = results[0].ignored.length;
  const actions = [
    { label: m.workshop_pack_reveal_action(), onClick: () => revealPath(results[0].outputPath) },
  ];
  /* Requested rather than opened, because a pack also starts from the grid, where no
     editor is mounted. See `pendingDocuments`. */
  if (leftOut > 0) {
    actions.push({
      label: m.workshop_pack_left_out_action({ count: leftOut }),
      onClick: () =>
        useWorkshopEditorStore.getState().requestDocument(project.path, ignoreRulesDocument()),
    });
  }

  toast.toast({
    type: warnings.length > 0 ? "warning" : "success",
    title: m.workshop_pack_done_title({ name }),
    description: (
      <>
        {results.map((result) => (
          <span
            key={result.fileName}
            title={result.fileName}
            className="block truncate font-mono text-meta text-surface-300 select-text"
          >
            {result.fileName}
          </span>
        ))}
        {warnings.length > 0 && <Lines lines={warnings} />}
      </>
    ),
    actions,
    timeout: warnings.length > 0 ? 9000 : 6000,
  });
}

function reportMany(
  toast: Toaster,
  outcomes: Array<{ project: WorkshopProject; outcome: PackOutcome }>,
) {
  const packed = outcomes.filter(({ outcome }) => outcome.kind === "packed").length;
  const missed = outcomes.flatMap(({ project, outcome }) => {
    if (outcome.kind === "packed") return [];

    const reason = outcome.kind === "refused" ? outcome.errors[0] : outcome.error;
    return [m.workshop_pack_missed_line({ name: project.displayName, reason })];
  });

  toast.toast({
    type: missed.length === 0 ? "success" : "error",
    title: m.workshop_pack_many_title({ packed, total: outcomes.length }),
    description: missed.length > 0 ? <Lines lines={missed} /> : undefined,
    timeout: missed.length > 0 ? 9000 : 6000,
  });
}

/** Backend sentences under a toast title, the first few and a count of the rest. */
function Lines({ lines }: { lines: string[] }) {
  const shown = lines.slice(0, LISTED_LINES);
  const rest = lines.length - shown.length;

  return (
    <>
      {shown.map((line) => (
        <span key={line} className="block select-text">
          {line}
        </span>
      ))}
      {rest > 0 && <span className="block">{m.workshop_pack_more_label({ count: rest })}</span>}
    </>
  );
}

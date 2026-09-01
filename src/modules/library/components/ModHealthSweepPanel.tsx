import {
  CaretDownIcon,
  CaretUpIcon,
  PackageIcon,
  PlugsIcon,
  StackIcon,
  XIcon,
} from "@phosphor-icons/react";
import { type ReactNode, useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

import {
  Button,
  ButtonGroup,
  Code,
  IconButton,
  Menu,
  Progress,
  SeverityGlyph,
  SeverityTally,
  ShockedPoroDuotoneIcon,
  Tooltip,
  WolfIcon,
  worstOf,
} from "@/components";
import {
  type ModHealthVerdict,
  type ModRepairProgress,
  type ProblemSeverity,
  type RuleBrief,
} from "@/lib/tauri";
import { useModHealthDrawerStore } from "@/stores";

import {
  type RepairRun,
  useBrokenMods,
  useCancelModHealthRun,
  useInstalledMods,
  useRepairMod,
  useRepairMods,
  useRepairTargets,
} from "../api";
import { HEADLINE, type SweepTone, toneOf } from "./modHealthNotice";

interface ModHealthSweepPanelProps {
  onClose: () => void;
}

/**
 * What the sweep found: a header, the verdicts as two groups, and the press
 * that repairs them.
 *
 * Per "The status bar item and the drawer" in docs/ux/MOD_HEALTH.md. The shell
 * around it belongs to the caller, so the centred dialog and the sheet draw one
 * finding rather than two that drift apart.
 *
 * It owns the feature's only `useRepairMods`, whose progress listener has to be
 * mounted once, so exactly one shell may be mounted at a time. A row repairs
 * through `useRepairMod` instead, which listens to nothing and so can be held
 * once per row.
 */
export function ModHealthSweepPanel({ onClose }: ModHealthSweepPanelProps) {
  const { all, repairable, unrepairable } = useBrokenMods();
  const repair = useRepairMods();
  const { enabled } = useRepairTargets();
  const requested = useModHealthDrawerStore((s) => s.repairRequested);
  const takeRequest = useModHealthDrawerStore((s) => s.takeRepairRequest);

  /* The launch guard's "Repair first" opens the panel and asks for the run in
     one press, and the run is this component's to start. */
  useEffect(() => {
    if (!requested || repair.isRepairing) return;
    takeRequest();
    if (enabled.length > 0) repair.repair(enabled.map((verdict) => verdict.modId));
  }, [requested, enabled, repair, takeRequest]);

  const tone = toneOf(repairable.length);
  const fixable = repairable.length > 0;

  return (
    <>
      {/* The rim is the shell's, so a section draws only what divides it from
          the next one. */}
      <header
        className={`relative flex shrink-0 items-start gap-2.5 px-3 py-2.5 select-none ${tone.wash}`}
      >
        <PanelMark fixable={fixable} tone={tone} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium text-surface-100">{HEADLINE}</h2>
          <p className="text-xs text-surface-300">
            <Recommendation repairable={repairable.length} unrepairable={unrepairable.length} />
          </p>
        </div>
        <IconButton
          variant="ghost"
          size="sm"
          compact
          icon={<XIcon className="h-4 w-4" weight="bold" />}
          onClick={onClose}
          aria-label="Close"
        />
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 bottom-0 h-px ${tone.rule}`}
        />
      </header>

      {/* One mod per row, as the Problems panel lists one file per row -
          DS-REPORT-PANEL. What a row is owed is its own severities, so it is
          marked on the row rather than said by a heading over a class of them. */}
      <div className="mx-2 my-2 min-h-0 flex-1 overflow-y-auto rounded-xl border border-surface-700 bg-surface-950/30 scrollbar-md">
        <VerdictRows verdicts={all} />
      </div>

      <PanelActions run={repair} fixable={fixable} onClose={onClose} />
    </>
  );
}

/**
 * The glyph the header is read from, at twice the size of a control's icon.
 *
 * The wolf carries its own amber rather than `currentColor`, and that amber is
 * the warning tone's. The poro is line art in one colour, so it takes the danger
 * tone a library no repair can reach is announced in.
 */
function PanelMark({ fixable, tone }: { fixable: boolean; tone: SweepTone }) {
  if (fixable) return <WolfIcon className="h-10 w-10 shrink-0" />;

  return <ShockedPoroDuotoneIcon className={twMerge("h-10 w-10 shrink-0", tone.chip)} />;
}

/**
 * The panel's last section: the way out, the repair beside it, or the run.
 *
 * The run is held by the panel rather than here, because the hook behind it
 * carries the progress subscription and has to be mounted exactly once.
 */
function PanelActions({
  run,
  fixable,
  onClose,
}: {
  run: RepairRun;
  fixable: boolean;
  onClose: () => void;
}) {
  if (run.progress) return <RepairProgress progress={run.progress} />;

  /* No repair reaches any of them, so the dismissal is the whole of what the
     footer has to offer and takes the confirm seat itself. */
  if (!fixable) {
    return (
      <PanelFoot>
        <Button size="sm" variant="filled" onClick={onClose}>
          Close
        </Button>
      </PanelFoot>
    );
  }

  return (
    <PanelFoot>
      <Button size="sm" variant="ghost" onClick={onClose}>
        Close
      </Button>
      <RepairPress run={run} />
    </PanelFoot>
  );
}

/**
 * The press that starts a repair, and the scope it runs over.
 *
 * Splits when some of the broken mods are switched off, per "Repair all" in
 * docs/ux/MOD_HEALTH.md. The press repairs what the next game will carry, and
 * the whole library is the deliberate second choice behind the caret.
 */
function RepairPress({ run }: { run: RepairRun }) {
  const { enabled, all } = useRepairTargets();

  const start = (verdicts: ModHealthVerdict[]) =>
    run.repair(verdicts.map((verdict) => verdict.modId));

  /* Nothing is switched off, so the two presses would do the same thing and a
     caret would only ask the reader to find that out. */
  if (enabled.length === all.length) {
    return (
      <Button size="sm" variant="filled" loading={run.isRepairing} onClick={() => start(all)}>
        <PlugsIcon className="h-4 w-4" weight="duotone" />
        Repair {plural(all.length, "mod")}
      </Button>
    );
  }

  /* Nothing broken is switched on, so there is no next-game work to lead with.
     Splitting here offers a dead press as the recommendation and hides the only
     run that does anything behind a caret. */
  if (enabled.length === 0) {
    return (
      <Button size="sm" variant="filled" loading={run.isRepairing} onClick={() => start(all)}>
        <StackIcon className="h-4 w-4" weight="duotone" />
        Repair all {all.length}
      </Button>
    );
  }

  return (
    <ButtonGroup>
      <Button size="sm" variant="filled" loading={run.isRepairing} onClick={() => start(enabled)}>
        <PlugsIcon className="h-4 w-4" weight="duotone" />
        Repair {plural(enabled.length, "enabled mod")}
      </Button>
      <Menu.Root>
        <Menu.Trigger
          render={
            <IconButton
              icon={<CaretUpIcon weight="bold" className="h-4 w-4" />}
              variant="filled"
              size="sm"
              aria-label="More repair options"
              className="w-auto px-2"
              disabled={run.isRepairing}
            />
          }
        />
        <Menu.Portal>
          <Menu.Positioner side="top" align="end">
            <Menu.Popup className="w-56">
              <Menu.Item
                icon={<StackIcon weight="duotone" className="h-4 w-4" />}
                onClick={() => start(all)}
              >
                Repair all {all.length}
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </ButtonGroup>
  );
}

/**
 * The band the panel is answered from, in a dialog's confirm seat.
 *
 * At the header's own padding rather than [`Dialog.Footer`]'s, so the presses
 * line up with the rows above them in a panel this dense. No rule and no top
 * padding of its own: the inset panel's margin is already the separation.
 */
function PanelFoot({ children }: { children: ReactNode }) {
  return (
    <div className="flex shrink-0 justify-end gap-2 px-3 pt-0 pb-2.5 select-none">{children}</div>
  );
}

/**
 * Where the running repair has got to, in the seat its own button was in.
 *
 * The panel names every mod the run is working through, so a toast over the top
 * of it would cover the list to report on it.
 */
function RepairProgress({ progress }: { progress: ModRepairProgress }) {
  const { data: mods = [] } = useInstalledMods();
  const cancel = useCancelModHealthRun();
  const names = progress.inFlight.map((id) => mods.find((mod) => mod.id === id)?.displayName ?? id);

  return (
    <div className="shrink-0 border-t border-accent-500/35 bg-accent-500/15 px-3 py-2.5 select-none">
      <Progress.Root value={progress.completed} max={progress.total}>
        <div className="mb-1.5 flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-surface-100">
            {repairingLabel(names)}
          </span>
          <span className="shrink-0 text-xs text-surface-300 tabular-nums">
            {progress.completed} / {progress.total}
          </span>
          {/* A mod already written stays written, so this stops the run rather
              than undoing it. What it did not reach keeps its own verdict. */}
          <IconButton
            variant="ghost"
            size="xs"
            compact
            icon={<XIcon className="h-3.5 w-3.5" weight="bold" />}
            onClick={() => cancel.mutate()}
            disabled={cancel.isPending}
            aria-label="Stop the repair"
            className="-my-1 h-5 w-5 shrink-0"
          />
        </div>
        <Progress.Track size="sm">
          <Progress.Indicator />
        </Progress.Track>
      </Progress.Root>
    </div>
  );
}

/**
 * What a run working on several mods at once calls itself.
 *
 * One name and a count of the rest, rather than a list: the row is one line
 * wide and three mod names do not fit in it. A run between mods names none.
 */
function repairingLabel(names: string[]) {
  const [first, ...rest] = names;
  if (!first) return "Repairing your mods";
  if (rest.length === 0) return `Repairing ${first}`;
  return `Repairing ${first} and ${rest.length} more`;
}

/**
 * The line under the title, which is what the reader is being asked to do.
 *
 * Three states, because "repair these" and "go and find newer ones" are different
 * errands and a list can be either or both. The title says what was found, so
 * none of these repeat it.
 */
function Recommendation({
  repairable,
  unrepairable,
}: {
  repairable: number;
  unrepairable: number;
}) {
  if (repairable === 0) {
    return <>None of them are auto-fixable, so look for updated versions</>;
  }

  if (unrepairable === 0) {
    return (
      <>
        All of them can be repaired automatically, so{" "}
        <strong className="font-medium text-surface-200">repairing is recommended</strong>
      </>
    );
  }

  return (
    <>
      <strong className="font-medium text-surface-200">Repairing is recommended</strong>, though
      some will need updated versions instead
    </>
  );
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Every unhealthy mod, worst first.
 *
 * The list is flat because the two verdicts were never a ranking: a mod one
 * repair reaches and six hundred findings do not was filed above a mod with a
 * single fatal nothing can reach. Severity is what a reader is triaging by, so
 * it is what orders the rows, and the footer's own targets still lead.
 */
function VerdictRows({ verdicts }: { verdicts: ModHealthVerdict[] }) {
  const { data: mods = [] } = useInstalledMods();
  const enabled = new Set(mods.filter((mod) => mod.enabled).map((mod) => mod.id));

  const sorted = [...verdicts].sort((a, b) => {
    const lead = Number(enabled.has(b.modId)) - Number(enabled.has(a.modId));
    if (lead !== 0) return lead;
    const worst = RANK[worstOf(a.counts)] - RANK[worstOf(b.counts)];
    if (worst !== 0) return worst;
    return totalOf(b) - totalOf(a);
  });

  return (
    <ul className="flex flex-col py-1 select-none">
      {sorted.map((verdict) => (
        <VerdictRow key={verdict.modId} verdict={verdict} />
      ))}
    </ul>
  );
}

/** Where each severity sits when rows are ordered by the worst thing in them. */
const RANK: Record<ProblemSeverity, number> = { fatal: 0, error: 1, warning: 2, info: 3 };

/**
 * One mod's row: the mark, the name as a disclosure, and what is wrong with it.
 *
 * The severities take the seat the total count had, because a reader triaging a
 * list is asking how bad rather than how many, and the Repair press takes that
 * seat back on hover.
 */
function VerdictRow({ verdict }: { verdict: ModHealthVerdict }) {
  const { data: mods = [] } = useInstalledMods();
  const repair = useRepairMod();
  const [open, setOpen] = useState(false);
  const mod = mods.find((candidate) => candidate.id === verdict.modId);
  const name = mod?.displayName ?? verdict.modId;
  const fixable = verdict.health === "repairable";
  /* A verdict recorded before briefs existed has nothing to unfold until its
     next check, and its row stays plain text. */
  const rules = verdict.rules ?? [];

  return (
    <li className="text-row">
      <div className="group/row relative flex items-center gap-2 px-3 py-1.5 hover:bg-surface-veil-soft">
        <RowMark enabled={mod?.enabled ?? false} />
        {rules.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:outline-none focus-visible:ring-inset"
          >
            <span className="min-w-0 truncate font-medium text-surface-100">{name}</span>
            <CaretDownIcon
              weight="bold"
              className={twMerge(
                "h-3 w-3 shrink-0 text-surface-500 transition-transform",
                open && "rotate-180",
              )}
            />
          </button>
        )}
        {rules.length === 0 && (
          <span className="min-w-0 flex-1 truncate font-medium text-surface-100 select-text">
            {name}
          </span>
        )}
        <span
          className={twMerge(
            "shrink-0 transition-opacity group-hover/row:opacity-0 group-has-[:focus-visible]/row:opacity-0",
            fixable && repair.isPending && "opacity-0",
          )}
        >
          <SeverityTally counts={verdict.counts} />
        </span>
        {fixable && (
          <Button
            variant="ghost"
            size="xs"
            compact
            loading={repair.isPending}
            onClick={() => repair.mutate(verdict.modId)}
            aria-label={`Repair ${name}`}
            className={twMerge(
              "absolute top-1/2 right-3 -translate-y-1/2 opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100",
              repair.isPending && "opacity-100",
            )}
          >
            <PlugsIcon className="h-4 w-4" weight="duotone" />
            Repair
          </Button>
        )}
        {/* The seat the press would be in. A reader asks why a row has none only
            at the moment they reach for it, so the sentence the group header
            used to hold over every such row is answered here instead. */}
        {!fixable && (
          <span className="absolute top-1/2 right-3 -translate-y-1/2 text-meta whitespace-nowrap text-surface-500 opacity-0 transition-opacity group-hover/row:opacity-100 group-has-[:focus-visible]/row:opacity-100">
            Needs an updated version
          </span>
        )}
      </div>
      {open && <RuleList verdict={verdict} />}
    </li>
  );
}

/** The row's package mark: the accent for a mod the next game carries, dim otherwise. */
function RowMark({ enabled }: { enabled: boolean }) {
  if (!enabled) {
    return <PackageIcon weight="duotone" className="h-4 w-4 shrink-0 text-surface-600" />;
  }

  return (
    <Tooltip content="Enabled">
      <span className="flex shrink-0" aria-label="Enabled">
        <PackageIcon weight="duotone" className="h-4 w-4 text-accent-400" />
      </span>
    </Tooltip>
  );
}

/**
 * The rules behind a row's count, for the reader who folds it open.
 *
 * Each rule says its cause in its own sentence. Titles and sentences, never a
 * site or a property path - that is the modder's half, and it lives in the
 * Problems panel.
 */
function RuleList({ verdict }: { verdict: ModHealthVerdict }) {
  const fixable = verdict.health === "repairable";

  return (
    <ul className="flex flex-col gap-1.5 pt-0.5 pb-2 pl-9">
      {(verdict.rules ?? []).map((brief) => (
        <li key={brief.rule} className="flex flex-col gap-0.5 pr-3 text-meta">
          <div className="flex items-center gap-1.5 text-surface-400">
            <SeverityGlyph severity={brief.severity} />
            <span className="min-w-0 truncate">{brief.title}</span>
            <RuleCount brief={brief} />
            {/* Only the exception is marked: a rule the press will not fix,
                inside a mod the press is offered for. */}
            {fixable && brief.fixable === 0 && (
              <span className="shrink-0 text-surface-500">not auto-fixable</span>
            )}
            <Code className="ml-auto select-text">{brief.rule}</Code>
          </div>
          {(brief.mismatches ?? []).length > 0 ? (
            /* The type pairs are the actual problem, so where the rule
               reports them they stand in for the rule's own sentence. */
            (brief.mismatches ?? []).map((mismatch) => (
              <p key={`${mismatch.expected}-${mismatch.found}`} className="text-surface-500">
                Expected <Code>{mismatch.expected}</Code>, found <Code>{mismatch.found}</Code>
              </p>
            ))
          ) : (
            <p className="text-surface-500">{brief.description}</p>
          )}
          {brief.unfixable != null && <p className="text-surface-500">{brief.unfixable}</p>}
        </li>
      ))}
    </ul>
  );
}

/**
 * A rule line's count, wearing the warning tone where a repair reaches it.
 *
 * The same rule can sit in both groups - fixable in one mod, not in another -
 * and the tinted count is what tells two otherwise identical lines apart.
 */
function RuleCount({ brief }: { brief: RuleBrief }) {
  if (brief.fixable === 0) {
    return <span className="shrink-0 tabular-nums">({brief.count})</span>;
  }

  if (brief.fixable === brief.count) {
    return (
      <Tooltip content="A repair fixes all of these">
        <span className="shrink-0 text-warning-text tabular-nums">({brief.count})</span>
      </Tooltip>
    );
  }

  return (
    <Tooltip content={`A repair fixes ${brief.fixable} of the ${brief.count}`}>
      <span className="shrink-0 text-warning-text tabular-nums">
        ({brief.fixable} of {brief.count})
      </span>
    </Tooltip>
  );
}

function totalOf(verdict: ModHealthVerdict): number {
  const { fatals, errors, warnings, infos } = verdict.counts;
  return fatals + errors + warnings + infos;
}

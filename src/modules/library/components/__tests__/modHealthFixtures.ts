import type {
  HealthSweepState,
  InstalledMod,
  ModHealth,
  ModHealthVerdict,
  RuleBrief,
} from "@/lib/tauri";
import type { BrokenMods } from "@/modules/library";

interface VerdictShape {
  /** Findings a repair would fix. Ignored for a verdict that is not repairable. */
  fixable?: number;
  /** Live findings behind the verdict, at whatever severity. */
  findings?: number;
  /** The per-rule fold, `undefined` giving one realistic brief covering every finding. */
  rules?: RuleBrief[];
}

export function verdict(
  modId: string,
  health: ModHealth,
  { fixable = 2, findings = 3, rules }: VerdictShape = {},
): ModHealthVerdict {
  const isFixable = health === "repairable";
  return {
    modId,
    health,
    fixable: isFixable ? fixable : 0,
    counts: { fatals: health === "healthy" ? 0 : findings, errors: 0, warnings: 0, infos: 0 },
    rules:
      rules ??
      (health === "healthy"
        ? []
        : [
            {
              rule: "bin-property-type",
              title: "Outdated bin properties",
              description: "A bin property's type does not match what the game expects",
              severity: "fatal",
              count: findings,
              fixable: isFixable ? fixable : 0,
              mismatches: [{ expected: "File", found: "Hash" }],
              /* Mirrors the backend: the why-not sentence rides along only
                 when the repair falls short of the count. */
              ...((isFixable ? fixable : 0) < findings && {
                unfixable: "Couldn't rehash because source string is unknown",
              }),
            },
          ]),
    checkedAt: "2026-08-28T10:00:00Z",
    basis: { build: "16.17.8087655", manager: "1.14.3" },
  };
}

export function installedMod(id: string, displayName: string, enabled = true): InstalledMod {
  return {
    id,
    name: id,
    displayName,
    version: "1.0.0",
    description: null,
    authors: [],
    enabled,
    installedAt: "2026-08-01T10:00:00Z",
    layers: [],
    tags: [],
    champions: [],
    maps: [],
    modDir: `/storage/mods/${id}`,
    format: "fantome",
    storage: "project",
    hasArchive: false,
    folderId: null,
  };
}

/** A sweep that ran and reported, which is what the banner draws on. */
export function finishedSweep(build: string | null = "16.17.8087655"): HealthSweepState {
  return {
    status: "finished",
    report: {
      basis: { build, manager: "1.14.3" },
      checked: 3,
      skipped: 0,
      repairable: [],
      unrepairable: [],
    },
  };
}

/**
 * The two lists a test names, plus the flat one the panel actually draws.
 *
 * `all` is derived rather than passed, so a test says which verdicts are
 * repairable and never has to keep a third list in step with the two.
 */
export function brokenMods({
  repairable = [],
  unrepairable = [],
}: Partial<Omit<BrokenMods, "all">> = {}): BrokenMods {
  return { all: [...repairable, ...unrepairable], repairable, unrepairable };
}

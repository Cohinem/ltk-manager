import { InfoIcon, WarningIcon, XCircleIcon } from "@phosphor-icons/react";

import type { Counts, ProblemSeverity } from "@/lib/tauri";

/** The glyph a severity draws, at the size a dense row carries. */
export function SeverityGlyph({ severity }: { severity: ProblemSeverity }) {
  /* DS-TEXT */
  if (severity === "fatal") {
    return <XCircleIcon weight="duotone" className="h-3.5 w-3.5 shrink-0 text-danger-text" />;
  }
  if (severity === "error") {
    return <XCircleIcon weight="duotone" className="h-3.5 w-3.5 shrink-0 text-danger-text" />;
  }
  if (severity === "warning") {
    return <WarningIcon weight="duotone" className="h-3.5 w-3.5 shrink-0 text-warning-text" />;
  }
  return <InfoIcon weight="duotone" className="h-3.5 w-3.5 shrink-0 text-info-text" />;
}

/** What a set of problems holds, by severity, with the empty rungs left out. */
export function SeverityTally({ counts }: { counts: Counts }) {
  return (
    <span className="flex shrink-0 items-center gap-2 text-meta text-surface-400 tabular-nums">
      {counts.fatals > 0 && (
        <span className="flex items-center gap-1">
          <SeverityGlyph severity="fatal" />
          {counts.fatals}
        </span>
      )}
      {counts.errors > 0 && (
        <span className="flex items-center gap-1">
          <SeverityGlyph severity="error" />
          {counts.errors}
        </span>
      )}
      {counts.warnings > 0 && (
        <span className="flex items-center gap-1">
          <SeverityGlyph severity="warning" />
          {counts.warnings}
        </span>
      )}
      {counts.infos > 0 && (
        <span className="flex items-center gap-1">
          <SeverityGlyph severity="info" />
          {counts.infos}
        </span>
      )}
    </span>
  );
}

/** The worst of `counts`, which is what a row is ranked and marked by. */
export function worstOf(counts: Counts): ProblemSeverity {
  if (counts.fatals > 0) return "fatal";
  if (counts.errors > 0) return "error";
  if (counts.warnings > 0) return "warning";
  return "info";
}

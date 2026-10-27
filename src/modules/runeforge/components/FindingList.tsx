import { Inline, SeverityGlyph, Stack } from "@/components";
import type { Finding } from "@/lib/tauri";

interface FindingListProps {
  label: string;
  findings: readonly Finding[];
}

/** The errors and warnings of an inspection or a scan, one row each, errors first. */
export function FindingList({ label, findings }: FindingListProps) {
  const reportable = findings.filter((finding) => finding.severity !== "info");
  if (reportable.length === 0) return null;

  const sorted = reportable.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  return (
    <Stack gap={1.5}>
      <span className="text-meta font-medium text-surface-300 select-none">{label}</span>
      <Stack as="ul" gap={1}>
        {sorted.map((finding, index) => (
          <li key={`${finding.code}-${index}`}>
            <Inline gap={1.5} align="start">
              <SeverityGlyph severity={finding.severity} />
              <span className="text-row text-surface-200 select-text">
                {finding.message}
                {finding.path && (
                  <span className="ml-1.5 font-mono text-meta text-surface-400">
                    {finding.path}
                  </span>
                )}
              </span>
            </Inline>
          </li>
        ))}
      </Stack>
    </Stack>
  );
}

const SEVERITY_RANK: Record<Finding["severity"], number> = { error: 0, warning: 1, info: 2 };

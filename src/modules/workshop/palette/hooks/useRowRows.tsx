import { RowsIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { errorSummary, m } from "@/i18n";
import type { BinFindHit } from "@/lib/tauri";

import { binQueries } from "../../bin/documents/hooks/useBinDocument";
import { rowKey } from "../../bin/tree/utils/binRows";
import { type OpenBin, useActiveDocumentId, useOpenBin } from "../../state";
import type { PaletteGroup, RankedRow } from "../utils/types";

/** How much of a row's value the trailing edge holds before it elides. */
const VALUE_CHARS = 40;

/**
 * The group the `@` scope contributes: the rows of the active bin or object tab.
 *
 * Asked only under the scope, and only of a tab that holds an open bin. The backend
 * matches and caps, so this dresses the hits as rows. "Open questions" in
 * docs/ux/BIN_EDITOR.md, under "Answered".
 */
export function useRowRows(term: string, enabled: boolean): PaletteGroup | null {
  const tabId = useActiveDocumentId();
  const bin = useOpenBin(tabId);
  const { data, error, isFetching } = useQuery({
    ...binQueries.find(enabled ? bin : null, term),
    enabled,
  });

  return useMemo(() => {
    if (!enabled) return null;
    const label = m.workshop_rows_label();
    if (tabId === null || bin === null) {
      return group(label, [noticeRow("rows:none", m.workshop_rows_no_bin_label())]);
    }
    if (term.length === 0) {
      return group(label, [noticeRow("rows:empty", m.workshop_rows_hint_label())]);
    }
    if (error) return group(label, [noticeRow("rows:error", errorSummary(error))]);
    if (!data) return { ...group(label, []), pending: isFetching };
    if (data.hits.length === 0) return null;

    return {
      source: "rows",
      label,
      rows: data.hits.map((hit) => toRow(hit, tabId, bin)),
      total: data.total,
      pending: isFetching,
    };
  }, [bin, data, enabled, error, isFetching, tabId, term]);
}

function group(label: string, rows: readonly RankedRow[]): PaletteGroup {
  return { source: "rows", label, rows, total: 0 };
}

/**
 * One matched row: its name on the title line, where it sits under it, its value at the
 * trailing edge.
 *
 * A file tab's row names its object before the path, the way Copy path writes it. An
 * object tab's rows are all of one object, which its header already names.
 */
function toRow(hit: BinFindHit, tabId: string, bin: OpenBin): RankedRow {
  const key = rowKey(hit);
  const path = bin.entry === null && hit.path.length > 0 ? `${hit.object}:${hit.label}` : hit.label;
  const value = hit.value ?? undefined;
  return {
    row: {
      id: `row:${key}`,
      source: "rows",
      name: hit.name,
      path,
      trailing:
        value !== undefined && value.length > VALUE_CHARS
          ? `${value.slice(0, VALUE_CHARS - 1)}…`
          : value,
      icon: <RowsIcon className="h-4 w-4 text-surface-400" />,
      target: { kind: "row", documentId: tabId, key },
    },
    band: 0,
    score: 0,
    nameRanges: hit.ranges,
    pathRanges: [],
  };
}

/** A row that reports rather than reveals. Disabled, so `Enter` never reaches its target. */
function noticeRow(id: string, text: string): RankedRow {
  return {
    band: Number.MAX_SAFE_INTEGER,
    score: 0,
    row: {
      id,
      source: "rows",
      name: text,
      path: "",
      disabled: true,
      icon: null,
      target: { kind: "prefix", prefix: "" },
    },
    nameRanges: [],
    pathRanges: [],
  };
}

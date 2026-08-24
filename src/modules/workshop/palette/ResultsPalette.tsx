import { useMemo } from "react";

import { CommandPalette, type PaletteGroupModel, type PaletteSelectModifiers } from "@/components";

import { paletteSource, type ParsedQuery } from "./sources";
import type { OpenIntent, PaletteGroup, PaletteRowData, PaletteSourceId } from "./types";

/** What the bar hands whichever palette its route mounts. */
export interface PaletteBranchProps {
  query: string;
  scope: PaletteSourceId | null;
  /** Prefix-aware, so a prefix typed at column 0 becomes the chip instead. */
  onQueryChange: (next: string) => void;
  onQueryClear: () => void;
  onScopeTo: (source: PaletteSourceId) => void;
  onScopeRemove: () => void;
  onClose: () => void;
}

export interface ResultsPaletteProps extends PaletteBranchProps {
  parsed: ParsedQuery;
  groups: readonly PaletteGroup[];
  placeholder: string;
  run: (row: PaletteRowData, intent: OpenIntent) => void;
}

/**
 * The box and its rows, for whichever context built them.
 *
 * Both palettes draw through this, so a row reads and runs the same whether it
 * came out of a project or out of the workshop over it.
 */
export function ResultsPalette({
  query,
  parsed,
  scope,
  groups,
  placeholder,
  onQueryChange,
  onQueryClear,
  onScopeTo,
  onScopeRemove,
  onClose,
  run,
}: ResultsPaletteProps) {
  const byId = useMemo(() => {
    const map = new Map<string, PaletteRowData>();
    for (const group of groups) {
      for (const row of group.rows) map.set(row.row.id, row.row);
    }
    return map;
  }, [groups]);

  const rowGroups = useMemo<PaletteGroupModel[]>(
    () =>
      groups.map((group) => ({
        id: group.source,
        label: group.label,
        total: group.total,
        pending: group.pending,
        rows: group.rows.map((row) => ({
          id: row.row.id,
          name: row.row.name,
          nameRanges: row.nameRanges,
          path: row.row.path.length > 0 ? row.row.path : undefined,
          pathRanges: row.pathRanges,
          trailing: row.row.trailing,
          icon: row.row.icon,
          disabled: row.row.disabled,
        })),
      })),
    [groups],
  );

  function handleSelect(rowId: string, modifiers: PaletteSelectModifiers) {
    const candidate = byId.get(rowId);
    if (!candidate) return;

    /* A prefix row narrows the box rather than leaving it, so it is the one
       target that keeps the palette open. */
    if (candidate.target.kind === "prefix") {
      onScopeTo(candidate.source);
      onQueryClear();
      return;
    }

    run(candidate, intentOf(modifiers));
  }

  function handleScopeTo(rowId: string) {
    const candidate = byId.get(rowId);
    if (!candidate) return;

    onScopeTo(candidate.source);
    /* The prefixes are the query while `?` lists them, so a scope taken from
       one of those rows leaves nothing behind to match on. */
    if (parsed.help) onQueryClear();
  }

  return (
    <CommandPalette
      query={query}
      onQueryChange={onQueryChange}
      placeholder={placeholder}
      scope={scope === null ? undefined : paletteSource(scope).label}
      onScopeRemove={onScopeRemove}
      onScopeTo={handleScopeTo}
      groups={rowGroups}
      onSelect={handleSelect}
      onClose={onClose}
      emptyMessage={`No match for “${parsed.term}”`}
    />
  );
}

function intentOf(modifiers: PaletteSelectModifiers): OpenIntent {
  if (modifiers.ctrlKey) return "beside";
  if (modifiers.altKey) return "permanent";
  return "default";
}

import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import type { KeyboardEvent, RefObject } from "react";

import { Field, IconButton, TogglePill } from "@/components";
import { m } from "@/i18n";
import type { MapItemKind } from "@/lib/tauri";
import { twMerge } from "@/utils";

import type { OutlineFilter } from "../utils/mapOutline";

/** The kinds in the order the chips list them. */
const KIND_ORDER: readonly MapItemKind[] = [
  "particle",
  "character",
  "locator",
  "group",
  "audio",
  "other",
];

const KIND_LABEL: Record<MapItemKind, () => string> = {
  particle: m.workshop_bin_map_outliner_kind_particle_label,
  character: m.workshop_bin_map_outliner_kind_character_label,
  locator: m.workshop_bin_map_outliner_kind_locator_label,
  group: m.workshop_bin_map_outliner_kind_group_label,
  audio: m.workshop_bin_map_outliner_kind_audio_label,
  other: m.workshop_bin_map_outliner_kind_other_label,
};

interface OutlinerSearchProps {
  filter: OutlineFilter;
  onChange: (filter: OutlineFilter) => void;
  /** How many placeables the map holds of each kind, which names the chips it offers. */
  counts: ReadonlyMap<MapItemKind, number>;
  /** How many placeables the filter keeps, shown while it narrows anything. */
  matches: number | null;
  inputRef: RefObject<HTMLInputElement | null>;
  /** Hand the keyboard to the tree, which a Down arrow in the box asks for. */
  onLeave: () => void;
}

/**
 * The outliner's search box over a chip per kind the map holds.
 *
 * The box matches a placeable's name or class, or a chunk's name. Escape clears it, and a
 * Down arrow moves into the tree. A chip keeps only its kind, and several chips keep each.
 */
export function OutlinerSearch({
  filter,
  onChange,
  counts,
  matches,
  inputRef,
  onLeave,
}: OutlinerSearchProps) {
  const kinds = KIND_ORDER.filter((kind) => (counts.get(kind) ?? 0) > 0);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && filter.text !== "") {
      event.preventDefault();
      event.stopPropagation();
      onChange({ ...filter, text: "" });
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      onLeave();
    }
  }

  function toggleKind(kind: MapItemKind) {
    const next = new Set(filter.kinds);
    if (!next.delete(kind)) next.add(kind);
    onChange({ ...filter, kinds: next });
  }

  return (
    <div data-ui="OutlinerSearch" className="flex shrink-0 flex-col gap-1.5 p-1.5 pb-1">
      <div
        /* DS-VEIL, DS-HOVER */
        className={twMerge(
          "flex h-7 items-center gap-0.5 rounded-md border border-surface-veil-strong bg-surface-veil-soft pr-0.5 pl-2",
          "transition-colors focus-within:border-accent-500 hover:border-accent-hover",
        )}
      >
        <MagnifyingGlassIcon className="size-3.5 shrink-0 text-surface-400" />
        <Field.Root className="min-w-0 flex-1">
          <Field.Control
            ref={inputRef}
            value={filter.text}
            onChange={(event) => onChange({ ...filter, text: event.target.value })}
            onKeyDown={handleKeyDown}
            placeholder={m.workshop_bin_map_outliner_search_placeholder()}
            aria-label={m.workshop_bin_map_outliner_search_placeholder()}
            spellCheck={false}
            autoComplete="off"
            className="h-6 rounded-none border-0 bg-transparent px-1 text-meta hover:border-0 focus:border-0 focus:ring-0"
          />
        </Field.Root>
        {matches !== null && (
          <span className="shrink-0 px-1 text-meta text-surface-400 tabular-nums">{matches}</span>
        )}
        {filter.text !== "" && (
          <IconButton
            icon={<XIcon className="size-3" />}
            onClick={() => onChange({ ...filter, text: "" })}
            aria-label={m.workshop_bin_map_outliner_search_clear_action()}
          />
        )}
      </div>
      {kinds.length > 1 && (
        <div
          role="group"
          aria-label={m.workshop_bin_map_outliner_kinds_label()}
          className="flex flex-wrap gap-1"
        >
          {kinds.map((kind) => (
            <TogglePill
              key={kind}
              size="xs"
              label={KIND_LABEL[kind]()}
              count={counts.get(kind)}
              active={filter.kinds.has(kind)}
              onClick={() => toggleKind(kind)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

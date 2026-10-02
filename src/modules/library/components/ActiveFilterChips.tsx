import { Chip } from "@/components";
import { m } from "@/i18n";
import { getMapLabel, getTagLabel } from "@/modules/library/utils/labels";

import {
  useHasActiveFilters,
  useLibraryFilterActions,
  useLibrarySelectedChampions,
  useLibrarySelectedMaps,
  useLibrarySelectedTags,
} from "../state";

export function ActiveFilterChips() {
  const selectedTags = useLibrarySelectedTags();
  const selectedChampions = useLibrarySelectedChampions();
  const selectedMaps = useLibrarySelectedMaps();
  const { toggleTag, toggleChampion, toggleMap, clearFilters } = useLibraryFilterActions();
  const hasActive = useHasActiveFilters();

  if (!hasActive) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
      {[...selectedTags].map((tag) => (
        <Chip key={`tag:${tag}`} size="md" tone="tag" onRemove={() => toggleTag(tag)}>
          {getTagLabel(tag)}
        </Chip>
      ))}
      {[...selectedChampions].map((champ) => (
        <Chip
          key={`champ:${champ}`}
          size="md"
          tone="champion"
          onRemove={() => toggleChampion(champ)}
        >
          {champ}
        </Chip>
      ))}
      {[...selectedMaps].map((map) => (
        <Chip key={`map:${map}`} size="md" tone="map" onRemove={() => toggleMap(map)}>
          {getMapLabel(map)}
        </Chip>
      ))}
      <button
        type="button"
        onClick={clearFilters}
        className="cursor-pointer text-xs text-surface-400 hover:text-surface-200"
      >
        {m.common_filter_clear_all_action()}
      </button>
    </div>
  );
}

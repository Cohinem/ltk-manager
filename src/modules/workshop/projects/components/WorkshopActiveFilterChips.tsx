import { Chip } from "@/components";
import { m } from "@/i18n";
import { ChampionChip } from "@/modules/champions";
import { getMapLabel, getTagLabel } from "@/modules/library";

import {
  useHasActiveWorkshopFilters,
  useSetWorkshopLocation,
  useWorkshopFilterActions,
  useWorkshopLocation,
  useWorkshopSelectedChampions,
  useWorkshopSelectedMaps,
  useWorkshopSelectedTags,
} from "../../state";

export function WorkshopActiveFilterChips() {
  const selectedTags = useWorkshopSelectedTags();
  const selectedChampions = useWorkshopSelectedChampions();
  const selectedMaps = useWorkshopSelectedMaps();
  const { toggleTag, toggleChampion, toggleMap, clearFilters } = useWorkshopFilterActions();
  const hasActive = useHasActiveWorkshopFilters();
  const location = useWorkshopLocation();
  const setLocation = useSetWorkshopLocation();

  if (!hasActive) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
      {location !== "all" && (
        <Chip size="md" onRemove={() => setLocation("all")}>
          {location === "opened"
            ? m.workshop_filter_location_opened_label()
            : m.workshop_folder_workshop_label()}
        </Chip>
      )}
      {[...selectedTags].map((tag) => (
        <Chip key={`tag:${tag}`} size="md" tone="tag" onRemove={() => toggleTag(tag)}>
          {getTagLabel(tag)}
        </Chip>
      ))}
      {[...selectedChampions].map((champ) => (
        <ChampionChip
          key={`champ:${champ}`}
          value={champ}
          size="md"
          onRemove={() => toggleChampion(champ)}
        />
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

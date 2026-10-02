import { TagIcon } from "@phosphor-icons/react";
import { type ReactNode, useMemo } from "react";

import { ChampionIcon, MultiSelect, type MultiSelectOption, SectionCard } from "@/components";
import { m } from "@/i18n";
import { ChampionPicker } from "@/modules/champions";
import { getMapLabel, getTagLabel, WELL_KNOWN_MAPS, WELL_KNOWN_TAGS } from "@/modules/library";
import { twMerge } from "@/utils";

interface CategorizationSectionProps {
  selectedTags: Set<string>;
  onTagsChange: (tags: Set<string>) => void;
  selectedMaps: Set<string>;
  onMapsChange: (maps: Set<string>) => void;
  champions: readonly string[];
  onChampionsChange: (champions: string[]) => void;
}

export function CategorizationSection({
  selectedTags,
  onTagsChange,
  selectedMaps,
  onMapsChange,
  champions,
  onChampionsChange,
}: CategorizationSectionProps) {
  const tagOptions = useMemo<MultiSelectOption[]>(
    () => WELL_KNOWN_TAGS.map((v) => ({ value: v, label: getTagLabel(v) })),
    [],
  );
  const mapOptions = useMemo<MultiSelectOption[]>(
    () => WELL_KNOWN_MAPS.map((v) => ({ value: v, label: getMapLabel(v) })),
    [],
  );

  return (
    <SectionCard
      title={m.workshop_details_categorization_title()}
      icon={<TagIcon className="size-4" />}
      description={m.workshop_details_categorization_description()}
      panelClassName="bg-surface-800"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Labelled label={m.workshop_details_tags_label()}>
          <MultiSelect
            variant="field"
            options={tagOptions}
            selected={selectedTags}
            onChange={onTagsChange}
            label={m.workshop_details_tags_empty()}
            placeholder={m.workshop_details_tags_placeholder()}
          />
        </Labelled>
        <Labelled label={m.workshop_details_maps_label()}>
          <MultiSelect
            variant="field"
            options={mapOptions}
            selected={selectedMaps}
            onChange={onMapsChange}
            label={m.workshop_details_maps_empty()}
            placeholder={m.workshop_details_maps_placeholder()}
          />
        </Labelled>
        <Labelled
          label={m.workshop_details_champions_label()}
          icon={<ChampionIcon className="size-4 text-surface-400" />}
          className="sm:col-span-2"
        >
          <ChampionPicker
            value={champions}
            onChange={onChampionsChange}
            aria-label={m.workshop_details_champions_label()}
          />
        </Labelled>
      </div>
    </SectionCard>
  );
}

function Labelled({
  label,
  icon,
  className,
  children,
}: {
  label: string;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={twMerge("flex flex-col gap-1.5", className)}>
      <span className="flex items-center gap-1.5 text-sm font-medium text-surface-200 select-none">
        {icon}
        {label}
      </span>
      {children}
    </div>
  );
}

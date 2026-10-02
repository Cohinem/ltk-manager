import {
  ClockCounterClockwiseIcon,
  ClockIcon,
  FolderSimpleIcon,
  TextAaIcon,
} from "@phosphor-icons/react";

import { FilterSection, TogglePill } from "@/components";
import { m } from "@/i18n";
import { FacetFilterPopover, type SortOption } from "@/modules/library";

import {
  useHasActiveWorkshopFilters,
  useSetWorkshopLocation,
  useWorkshopFilterStore,
  useWorkshopLocation,
  type WorkshopLocationFilter,
  type WorkshopSortField,
} from "../../state";
import { useWorkshopProjects } from "../api/useWorkshopProjects";
import { useWorkshopFilterOptions } from "../hooks/useFilterOptions";

function sortOptions(): SortOption<WorkshopSortField>[] {
  const byDate = { asc: m.common_sort_oldest_label(), desc: m.common_sort_newest_label() };

  return [
    {
      field: "lastOpened",
      label: m.workshop_sort_recent_label(),
      icon: <ClockCounterClockwiseIcon weight="bold" className="size-4" />,
      initialDirection: "desc",
      directionLabels: byDate,
    },
    {
      field: "name",
      label: m.workshop_explorer_sort_name_label(),
      icon: <TextAaIcon weight="bold" className="size-4" />,
      initialDirection: "asc",
      directionLabels: {
        asc: m.common_sort_name_asc_label(),
        desc: m.common_sort_name_desc_label(),
      },
    },
    {
      field: "lastModified",
      label: m.workshop_sort_modified_label(),
      icon: <ClockIcon weight="bold" className="size-4" />,
      initialDirection: "desc",
      directionLabels: byDate,
    },
  ];
}

/** How the grid is sorted, and which projects it is showing. */
export interface WorkshopFilterPopoverProps {
  /** Reported so the bar it hangs off knows it is still being used. */
  onOpenChange?: (open: boolean) => void;
}

export function WorkshopFilterPopover({ onOpenChange }: WorkshopFilterPopoverProps) {
  const { data: projects = [] } = useWorkshopProjects();
  const filterOptions = useWorkshopFilterOptions(projects);
  const hasActive = useHasActiveWorkshopFilters();

  return (
    <FacetFilterPopover
      store={useWorkshopFilterStore}
      options={filterOptions}
      sortOptions={sortOptions()}
      hasActive={hasActive}
      triggerLabel={m.workshop_filter_trigger_label()}
      onOpenChange={onOpenChange}
    >
      <FilterSection
        title={m.workshop_filter_location_label()}
        icon={<FolderSimpleIcon className="size-3.5" />}
      >
        <LocationOptions />
      </FilterSection>
    </FacetFilterPopover>
  );
}

/** Which projects the grid lists by where they live. */
function LocationOptions() {
  const location = useWorkshopLocation();
  const setLocation = useSetWorkshopLocation();

  const options: { value: WorkshopLocationFilter; label: string }[] = [
    { value: "all", label: m.workshop_filter_location_all_label() },
    { value: "workshop", label: m.workshop_folder_workshop_label() },
    { value: "opened", label: m.workshop_filter_location_opened_label() },
  ];

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <TogglePill
          key={option.value}
          label={option.label}
          active={location === option.value}
          onClick={() => setLocation(option.value)}
        />
      ))}
    </div>
  );
}

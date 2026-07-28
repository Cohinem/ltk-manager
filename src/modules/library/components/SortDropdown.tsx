import { Select } from "@/components";
import { type SortConfig, useLibraryFilterStore } from "@/stores";

const SORT_OPTIONS = [
  { value: "priority:desc", label: "Priority" },
  { value: "name:asc", label: "Name (A-Z)" },
  { value: "name:desc", label: "Name (Z-A)" },
  { value: "installedAt:desc", label: "Newest First" },
  { value: "installedAt:asc", label: "Oldest First" },
  { value: "enabled:asc", label: "Enabled First" },
];

const LABEL_MAP = Object.fromEntries(SORT_OPTIONS.map((o) => [o.value, o.label]));

function toValue(sort: SortConfig): string {
  return `${sort.field}:${sort.direction}`;
}

function fromValue(value: string): SortConfig {
  const [field, direction] = value.split(":") as [SortConfig["field"], SortConfig["direction"]];
  return { field, direction };
}

export function SortDropdown() {
  const { sort, setSort } = useLibraryFilterStore();

  return (
    <Select.Root value={toValue(sort)} onValueChange={(v) => v && setSort(fromValue(v))}>
      <Select.Trigger className="w-48 text-xs">
        <Select.Value prefix="Sort by:">
          {(value: string) => LABEL_MAP[value] ?? "Sort"}
        </Select.Value>
        <Select.Icon />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner>
          <Select.Popup>
            {SORT_OPTIONS.map((opt) => (
              <Select.Item key={opt.value} value={opt.value}>
                {opt.label}
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

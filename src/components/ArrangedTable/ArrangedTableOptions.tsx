import { m } from "@/i18n";

import { Button } from "../Button";
import { Checkbox } from "../Checkbox";
import { FilterSection } from "../FilterSection";
import { SegmentedControl } from "../SegmentedControl";
import { SelectField } from "../Select";
import type { TableLayoutStore } from "./layout";
import type { ArrangedColumn, RowDensity } from "./types";

function densityOptions() {
  return [
    { value: "compact" as const, label: m.common_table_density_compact_label() },
    { value: "default" as const, label: m.common_table_density_default_label() },
    { value: "comfortable" as const, label: m.common_table_density_comfortable_label() },
  ];
}

interface ArrangedTableOptionsProps<Id extends string, Group extends string> {
  store: TableLayoutStore<Id, Group>;
  specs: Record<Id, ArrangedColumn<Id>>;
  /** The label each grouping goes by, in the order the list offers them. */
  groupLabels: Record<Group, () => string>;
}

/** A view options popover's sections for an arranged table: row height, grouping and columns. */
export function ArrangedTableOptions<Id extends string, Group extends string>({
  store: useLayout,
  specs,
  groupLabels,
}: ArrangedTableOptionsProps<Id, Group>) {
  const density = useLayout((s) => s.density);
  const groupBy = useLayout((s) => s.groupBy);
  const columnOrder = useLayout((s) => s.columnOrder);
  const visibility = useLayout((s) => s.columnVisibility);
  const setDensity = useLayout((s) => s.setDensity);
  const setGroupBy = useLayout((s) => s.setGroupBy);
  const setColumnVisibility = useLayout((s) => s.setColumnVisibility);
  const resetLayout = useLayout((s) => s.resetLayout);

  const toggleable = columnOrder.filter((id) => !specs[id].pin);

  return (
    <>
      <FilterSection title={m.common_table_row_height_label()}>
        <SegmentedControl<RowDensity>
          size="sm"
          options={densityOptions()}
          value={density}
          onChange={setDensity}
          aria-label={m.common_table_row_height_label()}
          className="w-full"
        />
      </FilterSection>

      <FilterSection title={m.common_table_group_by_label()}>
        <SelectField
          options={(Object.entries(groupLabels) as [Group, () => string][]).map(
            ([value, label]) => ({ value, label: label() }),
          )}
          value={groupBy}
          onValueChange={(value) => value && setGroupBy(value as Group)}
        />
      </FilterSection>

      <FilterSection title={m.common_table_columns_label()}>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {toggleable.map((id) => {
            const spec = specs[id];
            return (
              <Checkbox
                key={id}
                size="sm"
                label={spec.name()}
                disabled={spec.required}
                checked={visibility[id] !== false}
                onCheckedChange={(checked) => setColumnVisibility({ ...visibility, [id]: checked })}
              />
            );
          })}
        </div>
      </FilterSection>

      <FilterSection>
        <Button variant="ghost" size="sm" onClick={resetLayout}>
          {m.common_table_reset_action()}
        </Button>
      </FilterSection>
    </>
  );
}

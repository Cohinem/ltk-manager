import { Code, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { LayerOverride } from "@/lib/tauri";

import { layerTitle } from "../../../documents/utils/contentDocument";
import { LayerGlyph } from "../../../layers/components/LayerGlyph";
import { useProjectContext } from "../../../projects/state/ProjectContext";
import { useDeclares } from "../hooks/useDeclared";

/**
 * The mark on a row of a layer file that a `game_data.yaml` of the project overrides at
 * build, or on a row of a declared document that a layer besides the target declares. Its
 * hover lists each declaring layer and the value it writes. ADR-0056.
 *
 * The glyph is the layer the build applies last, whose value the build packs.
 */
export function OverrideRowMark({ overrides }: { overrides: readonly LayerOverride[] }) {
  const project = useProjectContext();
  const declares = useDeclares();
  const last = overrides.at(-1);
  if (last === undefined) return null;

  const rowLabel = (layer: string) =>
    declares
      ? m.workshop_bin_declared_row_label({ layer: layerTitle(project, layer) })
      : m.workshop_bin_override_row_label({ layer: layerTitle(project, layer) });
  const label = rowLabel(last.layer);

  return (
    <Tooltip
      content={
        <span className="flex flex-col gap-1">
          {overrides.map((override, at) => (
            <span key={at} className="flex flex-col gap-0.5">
              <span>{rowLabel(override.layer)}</span>
              {override.value !== null && (
                <span className="flex items-baseline gap-1.5">
                  {m.workshop_bin_override_value_label()}
                  <Code>{override.value}</Code>
                </span>
              )}
            </span>
          ))}
          {last.mark.game !== null && (
            <span className="flex items-baseline gap-1.5">
              {declares
                ? m.workshop_bin_declared_game_value_label()
                : m.workshop_bin_override_file_label()}
              <Code>{last.mark.game}</Code>
            </span>
          )}
        </span>
      }
    >
      <span role="img" aria-label={label} className="flex shrink-0">
        {/* DS-KIND-HUE */}
        <LayerGlyph layerName={last.layer} className="h-3 w-3" />
      </span>
    </Tooltip>
  );
}

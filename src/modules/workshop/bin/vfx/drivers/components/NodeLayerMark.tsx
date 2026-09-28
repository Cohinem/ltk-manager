import type { CSSProperties } from "react";

import { Tooltip } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { layerTitle } from "../../../../documents/utils/contentDocument";
import { LayerGlyph } from "../../../../layers/components/LayerGlyph";
import { useProjectContext } from "../../../../projects/state/ProjectContext";
import { useDeclaredWithin } from "../../../documents/hooks/useDeclared";
import { useOverridesWithin } from "../../../documents/hooks/useOverrides";

/**
 * The layer glyph on a node or an emitter frame whose row, or a row under it, a declaration of
 * the chosen layer sets or a `game_data.yaml` overrides at build. The row marks inside the node
 * name each value. Per "Declarations on the board" in docs/ux/VFX_GRAPH.md.
 *
 * An override shows the glyph of the layer the build applies last, and its hover lists each.
 */
export function NodeLayerMark({
  rowKey,
  size = "0.75rem",
  className,
}: {
  rowKey: string;
  /** The glyph's width and height as a CSS length, which a far zoom scales. */
  size?: string;
  className?: string;
}) {
  const project = useProjectContext();
  const declared = useDeclaredWithin(rowKey);
  const overrides = useOverridesWithin(rowKey);
  const layer = declared ?? overrides.at(-1);
  if (layer === undefined) return null;

  const labels =
    declared !== null
      ? [m.workshop_bin_declared_node_label({ layer: layerTitle(project, declared) })]
      : overrides.map((each) =>
          m.workshop_bin_override_node_label({ layer: layerTitle(project, each) }),
        );

  return (
    <Tooltip
      content={
        <span className="flex flex-col gap-1">
          {labels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </span>
      }
    >
      <span
        role="img"
        aria-label={labels.join(" ")}
        data-layer-mark={layer}
        className={twMerge("flex shrink-0", className)}
        style={{ width: size, height: size } as CSSProperties}
      >
        {/* DS-KIND-HUE */}
        <LayerGlyph layerName={layer} className="h-full w-full" />
      </span>
    </Tooltip>
  );
}

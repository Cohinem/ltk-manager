import { m } from "@/i18n";

import { classFamily, colorCss } from "../../../values/utils/valueRows";
import { keysAt } from "../../engine/utils/sampleCurve";
import { useRunReadout } from "../../playback/state/runReadout";
import type { ValueItem } from "../utils/graphItems";
import { formatValues } from "../utils/nodeText";
import { useValuePlayhead } from "./valuePlayhead";
import { useFarZoom } from "./ZoomDetail";

/**
 * A keyed value read at the run's playhead, as `CurveMarker` places it: a colour as a swatch,
 * anything else as its numbers, caught up with the run at the readout's pace.
 *
 * Nothing while no playhead reaches the value, and nothing for a value with no keys, whose
 * draw differs per particle. The far zoom hides the readout, so it hears no run there.
 */
export function LiveValue({ item }: { item: ValueItem }) {
  const { run, read } = useValuePlayhead(item);
  const t01 = useRunReadout(useFarZoom() ? null : run, read);
  if (t01 === null || item.curve.keys.length === 0) return null;

  const values = keysAt(item.curve.keys, t01);
  const label = m.workshop_bin_graph_live_value_label();
  if (classFamily(item.classHash) === "color") {
    const [r = 0, g = 0, b = 0, a = 1] = values;
    return (
      <span
        role="img"
        aria-label={label}
        title={label}
        /* DS-RADIUS, DS-VEIL */
        className="size-3.5 shrink-0 rounded-sm border border-surface-veil-strong"
        style={{ background: colorCss([r, g, b, a]) }}
      />
    );
  }
  return (
    <span title={label} className="shrink-0 font-mono text-meta text-accent-300 tabular-nums">
      {formatValues(values)}
    </span>
  );
}

import {
  AlignBottomIcon,
  AlignCenterHorizontalIcon,
  AlignCenterVerticalIcon,
  AlignLeftIcon,
  AlignRightIcon,
  AlignTopIcon,
  ArrowDownIcon,
  ArrowLineDownIcon,
  ArrowLineUpIcon,
  ArrowUpIcon,
  type Icon,
} from "@phosphor-icons/react";

import { m } from "@/i18n";

import type { Alignment } from "../engine/edit/arrange";
import type { LayerStep } from "../engine/edit/targets";
import { CANVAS_KEYS } from "./canvasKeys";

/** The draw order steps, which an element's menu and the menu bar both list. */
export const LAYER_STEPS: readonly {
  readonly step: LayerStep;
  readonly Glyph: Icon;
  readonly label: () => string;
  readonly shortcut: string;
}[] = [
  {
    step: "front",
    Glyph: ArrowLineUpIcon,
    label: m.workshop_bin_atlas_front_action,
    shortcut: CANVAS_KEYS.front,
  },
  {
    step: "forward",
    Glyph: ArrowUpIcon,
    label: m.workshop_bin_atlas_forward_action,
    shortcut: CANVAS_KEYS.forward,
  },
  {
    step: "backward",
    Glyph: ArrowDownIcon,
    label: m.workshop_bin_atlas_backward_action,
    shortcut: CANVAS_KEYS.backward,
  },
  {
    step: "back",
    Glyph: ArrowLineDownIcon,
    label: m.workshop_bin_atlas_back_action,
    shortcut: CANVAS_KEYS.back,
  },
];

/** The alignments, which an element's menu and the menu bar both list. */
export const ALIGNMENTS: readonly {
  readonly how: Alignment;
  readonly Glyph: Icon;
  readonly label: () => string;
}[] = [
  { how: "left", Glyph: AlignLeftIcon, label: m.workshop_bin_atlas_align_left_action },
  {
    how: "centre",
    Glyph: AlignCenterHorizontalIcon,
    label: m.workshop_bin_atlas_align_centre_action,
  },
  { how: "right", Glyph: AlignRightIcon, label: m.workshop_bin_atlas_align_right_action },
  { how: "top", Glyph: AlignTopIcon, label: m.workshop_bin_atlas_align_top_action },
  {
    how: "middle",
    Glyph: AlignCenterVerticalIcon,
    label: m.workshop_bin_atlas_align_middle_action,
  },
  { how: "bottom", Glyph: AlignBottomIcon, label: m.workshop_bin_atlas_align_bottom_action },
];

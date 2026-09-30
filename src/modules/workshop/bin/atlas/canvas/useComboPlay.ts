import { useCallback, useMemo, useState } from "react";

import { m } from "@/i18n";

import type { PixelRect } from "../engine/layout/solve";
import {
  CLOSED_COMBO,
  comboButtons,
  comboOverlay,
  holds,
  NO_OVERLAY,
  type PreviewOverlay,
} from "../engine/model/combo";
import type { ViewTree } from "../engine/model/tree";
import { useAtlasPreviewActions, useComboHover, useViewPreview } from "../state/atlasPreview";

export interface ComboPlayInput {
  readonly view: string;
  readonly tree: ViewTree | null;
  readonly solved: ReadonlyMap<string, PixelRect> | null;
  readonly strings: ReadonlyMap<string, string>;
  /** Screen pixels at a point of the canvas pane. */
  readonly toScreen: (x: number, y: number) => readonly [number, number];
}

export interface ComboPlay {
  /** What the view's combo boxes draw over the file, per their preview state. */
  readonly overlay: PreviewOverlay;
  /** Whether the pointer is on something a click plays. */
  readonly pointing: boolean;
  /** A click at a point of the pane: a row selects its option, a button opens or closes its list, and anything else closes it. */
  readonly click: (x: number, y: number) => void;
  readonly move: (x: number, y: number) => void;
  readonly leave: () => void;
}

/**
 * The view's combo boxes played on the canvas as the client plays them, per "Combo boxes" in
 * docs/research/ui-data-layout.md. The options are the preview's, since a controller fills them
 * at run time.
 */
export function useComboPlay({ view, tree, solved, strings, toScreen }: ComboPlayInput): ComboPlay {
  const { combos } = useViewPreview(view);
  const hovered = useComboHover(view);
  const { setCombo, setComboHover } = useAtlasPreviewActions();
  const [pointing, setPointing] = useState(false);

  const overlay = useMemo(() => {
    if (tree === null || solved === null) return NO_OVERLAY;

    return comboOverlay(tree.view.comboBoxes, (key) => combos[key] ?? CLOSED_COMBO, hovered, {
      tree,
      solved,
      string: (key) => strings.get(key) ?? null,
      optionName: (option) => m.workshop_bin_atlas_combo_option_value({ number: option + 1 }),
    });
  }, [tree, solved, combos, hovered, strings]);

  const buttons = useMemo(
    () =>
      tree === null || solved === null ? [] : comboButtons(tree.view.comboBoxes, tree, solved),
    [tree, solved],
  );

  const click = useCallback(
    (x: number, y: number) => {
      const [sx, sy] = toScreen(x, y);
      const row = overlay.rows.find((each) => holds(each.rect, sx, sy));
      if (row !== undefined) {
        setCombo(view, row.combo, { selected: row.option, open: false });
        setComboHover(null);
        return;
      }

      const button = buttons.find((each) => holds(each.rect, sx, sy));
      if (button !== undefined) {
        const open = combos[button.combo]?.open ?? false;
        setCombo(view, button.combo, { open: !open });
        return;
      }

      for (const [key, state] of Object.entries(combos)) {
        if (state.open) setCombo(view, key, { open: false });
      }
    },
    [toScreen, overlay, buttons, combos, view, setCombo, setComboHover],
  );

  const move = useCallback(
    (x: number, y: number) => {
      const [sx, sy] = toScreen(x, y);
      const row = overlay.rows.find((each) => holds(each.rect, sx, sy));
      const next = row === undefined ? null : { view, combo: row.combo, option: row.option };
      if (next?.combo !== hovered?.combo || next?.option !== hovered?.option) setComboHover(next);
      setPointing(row !== undefined || buttons.some((each) => holds(each.rect, sx, sy)));
    },
    [toScreen, overlay, buttons, view, hovered, setComboHover],
  );

  const leave = useCallback(() => {
    if (hovered !== null) setComboHover(null);
    setPointing(false);
  }, [hovered, setComboHover]);

  return { overlay, pointing, click, move, leave };
}

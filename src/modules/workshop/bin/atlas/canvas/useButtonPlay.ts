import { useCallback, useMemo } from "react";

import type { PixelRect } from "../engine/layout/solve";
import { buttonHits, buttonOf, buttonStateOf } from "../engine/model/buttons";
import { holds } from "../engine/model/combo";
import type { ViewTree } from "../engine/model/tree";
import { useAtlasPreviewActions, useButtonPointer, useFrameSettings } from "../state/atlasPreview";

export interface ButtonPlayInput {
  readonly view: string;
  readonly tree: ViewTree | null;
  readonly solved: ReadonlyMap<string, PixelRect> | null;
  /** Screen pixels at a point of the canvas pane. */
  readonly toScreen: (x: number, y: number) => readonly [number, number];
}

export interface ButtonPlay {
  /** The state each button draws. */
  readonly states: ReadonlyMap<string, string>;
  /** Whether the pointer is over a button. */
  readonly pointing: boolean;
  /** A press at a point of the pane, which holds the button under it down. */
  readonly down: (x: number, y: number) => void;
  readonly up: () => void;
  readonly move: (x: number, y: number) => void;
  readonly leave: () => void;
}

/**
 * The view's buttons as the client plays them, per "Buttons" in docs/research/ui-data-layout.md:
 * each draws the state its flags, the pointer over it and a press on it choose, unless the toolbar
 * forces one state on every button. The pointer plays them in interact mode only.
 */
export function useButtonPlay({ view, tree, solved, toScreen }: ButtonPlayInput): ButtonPlay {
  const { buttonState: forced, interact } = useFrameSettings();
  const pointer = useButtonPointer(view);
  const { setButtonPointer } = useAtlasPreviewActions();

  const states = useMemo(() => {
    const held = new Map<string, string>();
    for (const element of tree?.view.elements ?? []) {
      const button = buttonOf(element);
      if (button === null) continue;

      const on = interact && pointer !== null;
      held.set(
        element.key,
        forced ??
          buttonStateOf(button, {
            hovered: on && pointer.hovered === element.key,
            pressed: on && pointer.pressed === element.key,
          }),
      );
    }
    return held;
  }, [tree, forced, interact, pointer]);

  const hits = useMemo(
    () => (tree === null || solved === null ? [] : buttonHits(tree, solved)),
    [tree, solved],
  );
  const under = useCallback(
    (x: number, y: number) => {
      const [sx, sy] = toScreen(x, y);
      return hits.find((hit) => holds(hit.rect, sx, sy))?.button ?? null;
    },
    [hits, toScreen],
  );

  const down = useCallback(
    (x: number, y: number) => {
      const button = under(x, y);
      setButtonPointer({ view, hovered: button, pressed: button });
    },
    [under, view, setButtonPointer],
  );
  const up = useCallback(() => {
    if (pointer?.pressed != null) setButtonPointer({ ...pointer, pressed: null });
  }, [pointer, setButtonPointer]);
  const move = useCallback(
    (x: number, y: number) => {
      const button = under(x, y);
      if (button !== (pointer?.hovered ?? null)) {
        setButtonPointer({ view, hovered: button, pressed: pointer?.pressed ?? null });
      }
    },
    [under, pointer, view, setButtonPointer],
  );
  const leave = useCallback(() => {
    if (pointer !== null) setButtonPointer(null);
  }, [pointer, setButtonPointer]);

  return { states, pointing: pointer?.hovered != null, down, up, move, leave };
}

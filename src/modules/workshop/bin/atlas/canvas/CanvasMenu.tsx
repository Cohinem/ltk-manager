import { useState } from "react";

import type { BinDocumentId } from "@/lib/tauri";

import { ElementMenu } from "../components/ElementMenu";
import { SceneMenu } from "../components/SceneMenu";
import type { ViewSource } from "../hooks/useAtlasSources";

/** What the canvas menu opened on: a frame's name, or the elements under the pointer. */
export type CanvasMenuTarget =
  | { readonly kind: "scene"; readonly scene: string }
  | {
      readonly kind: "element";
      readonly element: string | null;
      readonly under: readonly string[];
    };

const NOTHING: CanvasMenuTarget = { kind: "element", element: null, under: [] };

export interface CanvasMenuInputs {
  /** The frame whose name is at a point: its scene, null for the stacked frame, or undefined. */
  readonly nameAt: (x: number, y: number) => string | null | undefined;
  readonly pickAll: (x: number, y: number) => readonly string[];
  readonly selection: readonly string[];
  readonly select: (element: string) => void;
}

/**
 * The canvas menu's target, and `aim`, which points it at a spot of the pane: a frame's name opens
 * its scene's menu, and anywhere else the menu of the selected element under the spot, else of the
 * topmost, which it selects.
 */
export function useCanvasMenu({ nameAt, pickAll, selection, select }: CanvasMenuInputs) {
  const [target, setTarget] = useState<CanvasMenuTarget>(NOTHING);

  const aim = (x: number, y: number) => {
    const named = nameAt(x, y);
    if (named !== undefined) {
      setTarget(named === null ? NOTHING : { kind: "scene", scene: named });
      return;
    }

    const under = pickAll(x, y);
    const element = under.find((each) => selection.includes(each)) ?? under[0] ?? null;
    setTarget({ kind: "element", element, under });
    if (element !== null && !selection.includes(element)) select(element);
  };

  return { target, aim };
}

export interface CanvasMenuProps {
  readonly document: BinDocumentId;
  readonly entry: string;
  readonly source: ViewSource;
  readonly target: CanvasMenuTarget;
}

/** The canvas's context menu: a scene's, or an element's with the stack under the pointer. */
export function CanvasMenu({ document, entry, source, target }: CanvasMenuProps) {
  if (target.kind === "scene") {
    return <SceneMenu document={document} entry={entry} scene={target.scene} />;
  }

  return (
    <ElementMenu
      document={document}
      entry={entry}
      source={source}
      element={target.element}
      under={target.under}
      canvas
    />
  );
}

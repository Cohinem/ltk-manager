import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { BinDocumentId } from "@/lib/tauri";

import { useSandbox } from "../../../sandbox/state/SandboxContext";
import { uiQueries } from "../api/uiQueries";
import { roleHidden, roleTexts, withLoadout } from "../engine/model/loadout";
import { buildTree, type ViewTree } from "../engine/model/tree";
import type { View } from "../engine/model/view";

const NO_TEXTS: ReadonlyMap<string, string> = new Map();
const NO_HIDDEN: ReadonlySet<string> = new Set();

/**
 * A view as a preview draws it, the text its bound elements read in place of their own, and the
 * bound elements it draws off.
 */
export interface LoadoutView {
  readonly view: View | null;
  readonly tree: ViewTree | null;
  readonly texts: ReadonlyMap<string, string>;
  readonly hidden: ReadonlySet<string>;
}

/**
 * `view` filled with the sample loadout while `samples` draw, per `withLoadout`, and `tree` as it
 * stands otherwise. The loadout is read only for a view whose controller binds any element.
 */
export function useLoadoutView(
  document: BinDocumentId,
  view: View | null,
  tree: ViewTree | null,
  samples: boolean,
): LoadoutView {
  const sandbox = useSandbox();
  const wanted = samples && view !== null && view.bindings.length > 0;
  const loadout = useQuery({ ...uiQueries.loadout(document, sandbox), enabled: wanted }).data;

  return useMemo(() => {
    if (!wanted || view === null) return { view, tree, texts: NO_TEXTS, hidden: NO_HIDDEN };

    const drawn = withLoadout(view, loadout ?? null);
    return {
      view: drawn,
      tree: drawn === view ? tree : buildTree(drawn),
      texts: roleTexts(view),
      hidden: roleHidden(view),
    };
  }, [wanted, view, tree, loadout]);
}

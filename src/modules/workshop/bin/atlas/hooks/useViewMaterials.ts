import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { NoColorSpace } from "three";

import type { BinDocumentId } from "@/lib/tauri";
import { programTextureAssets, programWith, useAssetTextures } from "@/modules/viewport";

import { useSandbox } from "../../../sandbox/state/SandboxContext";
import { uiQueries } from "../api/uiQueries";
import type { View } from "../engine/model/view";
import type { ViewMaterial } from "../rendering/utils/uiMaterials";
import { useAtlasEdit } from "../state/atlasEdit";

/** A game shader samples its textures as stored, with no colour conversion. */
const RAW_TEXTURES = { colorSpace: NoColorSpace } as const;

const NO_MATERIALS: ReadonlyMap<string, ViewMaterial> = new Map();

/**
 * Each `StaticMaterialDef` an icon or a custom material effect of `view` draws with, by its path
 * or hash, once its program
 * has translated and while its textures load, per section 6 of docs/plans/atlas-renderer.md. A
 * material reads out of the shell's open scene bin where the project declares it, then out of
 * `document`, then out of the game.
 */
export function useViewMaterials(
  view: View | null,
  document: BinDocumentId,
): ReadonlyMap<string, ViewMaterial> {
  const edit = useAtlasEdit();
  const sandbox = useSandbox();
  const scene = edit?.variant ?? edit?.scene ?? null;
  const documents = useMemo(
    () => (scene === null || scene === document ? [document] : [scene, document]),
    [scene, document],
  );
  const entries = useMemo(() => materialsOf(view), [view]);

  const programs = useQuery(uiQueries.materials(documents, entries, sandbox)).data;
  const assets = useMemo(() => programTextureAssets(programs ?? []), [programs]);
  const textures = useAssetTextures(assets, RAW_TEXTURES);

  return useMemo(() => {
    if (programs === undefined) return NO_MATERIALS;

    const materials = new Map<string, ViewMaterial>();
    entries.forEach((entry, at) => {
      const program = programs[at] ?? null;
      const pass = programWith(program, textures);
      if (program !== null && pass !== null) {
        materials.set(entry, { pass, animated: program.animated });
      }
    });
    return materials;
  }, [entries, programs, textures]);
}

/** Every material `view` draws with, once each and sorted, so the read keys stay stable. */
function materialsOf(view: View | null): string[] {
  if (view === null) return [];

  const names = new Set<string>();
  for (const element of view.elements) {
    const { look } = element;
    if (look.kind === "icon" && look.material !== null) names.add(look.material);
    if (look.kind === "effect" && look.effect.effect === "customMaterial") {
      if (look.effect.material !== null) names.add(look.effect.material);
    }
  }
  return [...names].sort();
}

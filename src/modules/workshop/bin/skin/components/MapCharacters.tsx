import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { Matrix4 } from "three";

import type { AssetRef, BinDocumentId, MapCharacter, SkinModel } from "@/lib/tauri";
import {
  Character,
  createPose,
  DEFAULT_LAYER,
  type SceneClock,
  type SceneColors,
  useAssetTextures,
  useSceneColors,
  viewportQueries,
} from "@/modules/viewport";

import { useBinDocument } from "../../documents/hooks/useBinDocument";
import { nameHash } from "../../shared/utils/binHash";
import { skinQueries } from "../api/skinQueries";
import { charactersBySkin, sceneMatrix, skinFile, stoodCharacters } from "../utils/mapCharacters";
import { bindingOf, textureAssets } from "../utils/skinScene";

export interface MapCharactersProps {
  /** The map's open `.materials.bin`, and null until the scene holds it. */
  readonly document: BinDocumentId | null;
  /** The scene's clock, which a character is posed at. */
  readonly clock: SceneClock;
}

/**
 * The structures and level props a backdrop's map stands in its scene, in their bind pose.
 *
 * Each skin is read once out of the character's own bin, which is a file apart from the
 * map's, and drawn at every place the map stands it.
 */
export function MapCharacters({ document, clock }: MapCharactersProps) {
  const placed = useQuery(skinQueries.mapCharacters(document));
  const skins = useMemo(
    () => [...charactersBySkin(stoodCharacters(placed.data ?? [], DEFAULT_LAYER))],
    [placed.data],
  );
  const colors = useSceneColors();

  return skins.map(([skin, characters]) => (
    <LocatedSkin key={skin} skin={skin} characters={characters} clock={clock} colors={colors} />
  ));
}

interface SkinProps {
  /** The skin's entry path, `Characters/Turret/Skins/Skin0`. */
  readonly skin: string;
  readonly characters: readonly MapCharacter[];
  readonly clock: SceneClock;
  readonly colors: SceneColors;
}

/** A skin whose bin this install holds. One it does not is a prop the map draws without. */
function LocatedSkin(props: SkinProps) {
  const file = useQuery(skinQueries.gameFile(skinFile(props.skin)));
  if (file.data == null) return null;
  return <OpenedSkin {...props} asset={file.data} />;
}

function OpenedSkin({ asset, ...props }: SkinProps & { readonly asset: AssetRef }) {
  const { state } = useBinDocument(asset);
  if (state.status !== "open") return null;
  return <ReadSkin {...props} document={state.handle.document} />;
}

function ReadSkin({ document, ...props }: SkinProps & { readonly document: BinDocumentId }) {
  const skin = useQuery(skinQueries.skin(document, nameHash(props.skin)));
  if (skin.data === undefined) return null;
  return <PlacedSkin {...props} model={skin.data} />;
}

function PlacedSkin({
  model,
  characters,
  clock,
  colors,
}: SkinProps & { readonly model: SkinModel }) {
  const mesh = useQuery(viewportQueries.mesh(model.mesh?.asset ?? null));
  const skeleton = useQuery(viewportQueries.skeleton(model.skeleton?.asset ?? null));
  const pose = useMemo(
    () => (skeleton.data === undefined ? null : createPose(skeleton.data, null)),
    [skeleton.data],
  );
  const assets = useMemo(() => textureAssets(model), [model]);
  const textures = useAssetTextures(assets);
  const binding = useCallback(
    (submesh: string) => bindingOf(model, textures, submesh),
    [model, textures],
  );
  const matrices = useMemo(
    () => characters.map((character) => new Matrix4().fromArray(sceneMatrix(character.transform))),
    [characters],
  );

  if (mesh.data === undefined || pose === null) return null;
  return characters.map((character, at) => (
    <group key={character.name} matrix={matrices[at]} matrixAutoUpdate={false}>
      <Character
        mesh={mesh.data}
        pose={pose}
        clock={clock}
        bindingOf={binding}
        colors={colors}
        hidden={model.hidden}
        scale={model.scale ?? 1}
      />
    </group>
  ));
}

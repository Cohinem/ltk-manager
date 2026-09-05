import type { ObjectDeclaration } from "@/lib/tauri";

import { ObjectGlyph } from "../components/ObjectGlyph";
import { declaringFileContext, objectDocument } from "../documents/contentDocument";
import type { OpenIntent } from "../palette/types";
import { assetContext, assetKey } from "../preview/assetRef";
import { clickIntent, useOpenDocumentAs } from "../state";

interface DeclarationListProps {
  declarations: readonly ObjectDeclaration[];
  /** `0x` and eight hex digits. */
  objectHash: string;
  /** The object's path, which every declaration's tab is titled by. */
  objectPath: string;
  /** The title of the layer a declaration sits in, by the layer's name. */
  layerTitle: (layer: string) => string;
}

/** The files declaring one object, each opening its own tab. `Ctrl` opens beside. */
export function DeclarationList({
  declarations,
  objectHash,
  objectPath,
  layerTitle,
}: DeclarationListProps) {
  const open = useOpenDocumentAs();
  return (
    <ul data-ui="DeclarationList" className="flex flex-col">
      {declarations.map((declaration) => (
        <DeclarationRow
          key={assetKey(declaration.asset)}
          declaration={declaration}
          layerName={
            declaration.asset.kind === "layer" ? layerTitle(declaration.asset.layer) : null
          }
          onOpen={(intent) =>
            open(
              objectDocument(
                declaration.asset,
                objectHash,
                objectPath,
                declaration.file,
                declaration.class,
              ),
              intent,
            )
          }
        />
      ))}
    </ul>
  );
}

interface DeclarationRowProps {
  declaration: ObjectDeclaration;
  /** The layer's title where the declaration is a layer's, else null. */
  layerName: string | null;
  onOpen: (intent: OpenIntent) => void;
}

/** One declaring file: its path, and the archive or the layer it sits in. */
function DeclarationRow({ declaration, layerName, onOpen }: DeclarationRowProps) {
  const where = layerName ?? assetContext(declaration.asset);
  return (
    <li>
      <button
        type="button"
        /* DS-VEIL, DS-RADIUS */
        className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-left text-meta hover:bg-surface-veil"
        title={declaringFileContext(declaration.asset, declaration.file)}
        onClick={(event) => {
          event.stopPropagation();
          onOpen(clickIntent(event));
        }}
      >
        <ObjectGlyph
          objectClass={declaration.class}
          className="h-3.5 w-3.5 shrink-0 text-surface-400"
        />
        <span className="min-w-0 flex-1 truncate font-mono text-code text-surface-200">
          {declaration.file}
        </span>
        {where !== undefined && <span className="shrink-0 text-surface-400">{where}</span>}
      </button>
    </li>
  );
}

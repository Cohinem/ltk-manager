import { DownloadSimpleIcon, StackPlusIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { Button, Tooltip } from "@/components";
import { m } from "@/i18n";
import { DocumentToolbar, type EditorDocumentProps } from "@/modules/editor";

/* The leaves rather than the barrels, which pull the documents that circle back
   into this file. */
import { BinDocument } from "../../bin/documents/components/BinDocument";
import { MapFileDocument } from "../../bin/map/components/MapFileDocument";
import { mapPathOfFile } from "../../bin/map/utils/mapFile";
import type { ContentDocumentOf } from "../../documents/utils/contentDocument";
import { useExtractActions } from "../../gameBrowser/extraction/hooks/useExtractActions";
import { chunkTarget } from "../../gameBrowser/extraction/utils/extractTargets";
import { fileKindFromPath } from "../../gameBrowser/utils/fileKind";
import { useAssetInfo } from "../api/useAssetInfo";
import { webViewerOf } from "../utils/viewer";
import { isPropertyBin } from "./BinPreview";
import { FontPreview } from "./FontPreview";
import { ImagePreview } from "./ImagePreview";
import { MediaPreview } from "./MediaPreview";
import { SaveCopyAction } from "./SaveCopyAction";
import { TextPreview } from "./TextPreview";

/**
 * One asset, drawn by the viewer its file kind has.
 *
 * The kind comes off the name here, which costs nothing and keeps a texture's
 * pixels and its header on their two requests. A chunk no hash table names has
 * no extension to read, so its viewer is settled later, by the bytes.
 */
export function PreviewDocument({
  document,
  active,
}: EditorDocumentProps<ContentDocumentOf<"preview">>) {
  const named = fileKindFromPath(document.title);
  const info = useAssetInfo(document.asset, named === "unknown");
  const sniffed = info.data?.kind === "unsupported" && isPropertyBin(info.data.fileKind);

  const bin = isPropertyBin(named) || sniffed;
  const objects = (actions: ReactNode) => (
    <BinDocument
      documentId={document.id}
      asset={document.asset}
      name={document.title}
      file={declaringFile(document)}
      active={active}
      actions={actions}
    />
  );

  /* Either file of a map opens on the map it draws, per "A map's files" in
     docs/ux/BIN_EDITOR.md. */
  const map = mapPathOfFile(document.path ?? document.title);
  if (map !== null && (bin || named === "map_geometry")) {
    return (
      <MapFileDocument
        key={document.id}
        map={map}
        active={active}
        actions={<PreviewActions document={document} />}
        objects={bin ? objects : undefined}
      />
    );
  }

  if (bin) return objects(<PreviewActions document={document} />);

  return (
    <>
      <DocumentToolbar active={active}>
        <PreviewActions document={document} />
      </DocumentToolbar>
      <AssetViewer documentId={document.id} asset={document.asset} name={document.title} />
    </>
  );
}

interface AssetViewerProps {
  documentId: string;
  asset: ContentDocumentOf<"preview">["asset"];
  name: string;
}

/** The viewer a file's extension asks for, and the image viewer for every other file. */
function AssetViewer({ documentId, asset, name }: AssetViewerProps) {
  const viewer = webViewerOf(name);

  if (viewer === "video" || viewer === "audio") {
    return <MediaPreview asset={asset} name={name} media={viewer} />;
  }
  if (viewer === "text") return <TextPreview documentId={documentId} asset={asset} name={name} />;
  if (viewer === "font") return <FontPreview asset={asset} name={name} />;
  return <ImagePreview asset={asset} name={name} />;
}

/**
 * The file's path as an object tab names its declaring file: a chunk's path inside its
 * archive, a layer file's path inside its layer. A chunk no table names is its hash.
 */
function declaringFile(document: ContentDocumentOf<"preview">): string {
  const { asset } = document;
  if (asset.kind !== "gameChunk" && asset.kind !== "lcuChunk") return asset.path;
  const prefix = `${asset.wad}/`;
  const path = document.path ?? "";
  return path.startsWith(prefix) ? path.slice(prefix.length) : asset.pathHash;
}

/**
 * The ways the open asset leaves the tab.
 *
 * A modder with the texture already open should not go back to the tree for
 * it. **Save a copy…** is the whole of the dialog a single file needs - the
 * save dialog names the file and picks the folder - so the extract's own
 * dialog has nothing left to ask and is not offered here.
 */
function PreviewActions({ document }: Pick<PreviewProps, "document">) {
  const { run, lastFolder, layerLabel, busy } = useExtractActions();

  /* A layer file and a loose file are already on disk, so only a game chunk
     has anywhere to go. */
  const target = chunkTarget(document.asset, document.path);
  const name = document.title;

  return (
    <>
      {target && layerLabel && (
        <Button
          variant="ghost"
          size="sm"
          left={<StackPlusIcon className="size-4" />}
          disabled={busy}
          onClick={() => run("copy", [target], name)}
        >
          {m.workshop_preview_copy_into_action({ layer: layerLabel })}
        </Button>
      )}
      {target && lastFolder && (
        <Tooltip content={m.workshop_preview_extract_to_label({ folder: lastFolder })}>
          <Button
            variant="ghost"
            size="sm"
            left={<DownloadSimpleIcon className="size-4" />}
            disabled={busy}
            onClick={() => run("quick", [target], name)}
          >
            {m.workshop_preview_extract_action()}
          </Button>
        </Tooltip>
      )}
      <SaveCopyAction asset={document.asset} name={name} />
    </>
  );
}

type PreviewProps = EditorDocumentProps<ContentDocumentOf<"preview">>;

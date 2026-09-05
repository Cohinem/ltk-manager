import { DownloadSimpleIcon, StackPlusIcon } from "@phosphor-icons/react";

import { Button, Tooltip } from "@/components";
import { m } from "@/i18n";
import { DocumentToolbar, type EditorDocumentProps } from "@/modules/editor";

/* The leaves rather than the barrels, which pull the documents that circle back
   into this file. */
import { BinDocument } from "../bin/BinDocument";
import type { ContentDocumentOf } from "../documents/contentDocument";
import { chunkTarget } from "../gameBrowser/extractTargets";
import { fileKindFromPath } from "../gameBrowser/fileKind";
import { useExtractActions } from "../gameBrowser/useExtractActions";
import { isPropertyBin } from "./BinPreview";
import { ImagePreview } from "./ImagePreview";
import { SaveCopyAction } from "./SaveCopyAction";
import { useAssetInfo } from "./useAssetInfo";

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

  if (isPropertyBin(named) || sniffed) {
    return (
      <BinDocument
        documentId={document.id}
        asset={document.asset}
        name={document.title}
        active={active}
        actions={<PreviewActions document={document} />}
      />
    );
  }

  return (
    <>
      <DocumentToolbar active={active}>
        <PreviewActions document={document} />
      </DocumentToolbar>
      <ImagePreview asset={document.asset} name={document.title} />
    </>
  );
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
          size="xs"
          left={<StackPlusIcon className="h-4 w-4" />}
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
            size="xs"
            left={<DownloadSimpleIcon className="h-4 w-4" />}
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

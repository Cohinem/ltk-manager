import { DownloadSimpleIcon, StackPlusIcon } from "@phosphor-icons/react";

import { Button, Tooltip } from "@/components";
import { DocumentToolbar, type EditorDocumentProps } from "@/modules/editor";

import type { ContentDocumentOf } from "../documents/contentDocument";
/* The leaves rather than the gameBrowser barrel, which pulls the documents
   that circle back into this file. */
import { chunkTarget } from "../gameBrowser/extractTargets";
import { fileKindFromPath } from "../gameBrowser/fileKind";
import { useExtractActions } from "../gameBrowser/useExtractActions";
import { BinPreview, isPropertyBin } from "./BinPreview";
import { ImagePreview } from "./ImagePreview";
import { SaveCopyAction } from "./SaveCopyAction";

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
  return (
    <>
      <DocumentToolbar active={active}>
        <PreviewActions document={document} />
      </DocumentToolbar>
      <PreviewBody document={document} />
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
          Copy into {layerLabel}
        </Button>
      )}
      {target && lastFolder && (
        <Tooltip content={`Extract to ${lastFolder}`}>
          <Button
            variant="ghost"
            size="xs"
            left={<DownloadSimpleIcon className="h-4 w-4" />}
            disabled={busy}
            onClick={() => run("quick", [target], name)}
          >
            Extract
          </Button>
        </Tooltip>
      )}
      <SaveCopyAction asset={document.asset} name={name} />
    </>
  );
}

type PreviewProps = EditorDocumentProps<ContentDocumentOf<"preview">>;

function PreviewBody({ document }: Pick<PreviewProps, "document">) {
  if (isPropertyBin(fileKindFromPath(document.title))) {
    return <BinPreview asset={document.asset} name={document.title} />;
  }

  return <ImagePreview asset={document.asset} name={document.title} />;
}

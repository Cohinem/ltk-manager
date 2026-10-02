import type { Extension } from "@codemirror/state";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

import { Button, EmptyState, LoadingState, Tooltip } from "@/components";
import { m } from "@/i18n";
import { usePreviewFileUrl } from "@/lib/previewUrl";
import type { AssetRef } from "@/lib/tauri";
import { useDocumentFind } from "@/modules/editor";
import { formatBytes } from "@/utils";

import { DocumentFrame } from "../../shared/components/DocumentFrame";
import { PaneHint } from "../../shared/components/PaneHint";
import { MAX_TEXT_BYTES, previewQueries, type SourceText } from "../api/queries";
import { codeLanguageOf } from "../utils/codeLanguage";
import type { CodeViewHandle } from "./CodeView";
import { PreviewStatus } from "./PreviewStatus";

/* Its own chunk, so the editor and its grammars load with the first text file opened. */
const CodeView = lazy(() => import("./CodeView"));

/** The JSON in `source` indented, or null where it is not JSON or is already indented. */
function formattedJson(name: string, source: SourceText): string | null {
  if (source.truncated || !name.toLowerCase().endsWith(".json")) return null;

  try {
    const formatted = JSON.stringify(JSON.parse(source.text), null, 2);
    return formatted === source.text ? null : formatted;
  } catch {
    return null;
  }
}

function lineCount(text: string): number {
  let lines = 1;
  for (let at = text.indexOf("\n"); at >= 0; at = text.indexOf("\n", at + 1)) lines++;
  return lines;
}

/** The grammar `name` reads in, null until it loads and for a file with none. */
function useCodeLanguage(name: string): Extension | null {
  const [language, setLanguage] = useState<Extension | null>(null);

  useEffect(() => {
    const load = codeLanguageOf(name);
    setLanguage(null);
    if (!load) return;

    let live = true;
    void load().then((loaded) => {
      if (live) setLanguage(loaded);
    });
    return () => {
      live = false;
    };
  }, [name]);

  return language;
}

interface TextPreviewProps {
  documentId: string;
  asset: AssetRef;
  /** The file name, which the document resolved. A reference may hold a hash. */
  name: string;
}

/**
 * A file read as UTF-8 source, highlighted and read-only.
 *
 * An HTML page, a script or a stylesheet shows as its source and is never run or applied.
 * JSON opens indented, because the client ships it on one line, and turning **Format** off
 * shows the bytes as they are. `Ctrl+F` searches the text.
 */
export function TextPreview({ documentId, asset, name }: TextPreviewProps) {
  const url = usePreviewFileUrl(asset);
  const source = useQuery(previewQueries.text(url));

  const language = useCodeLanguage(name);
  const code = useRef<CodeViewHandle>(null);
  useDocumentFind(documentId, () => code.current?.openSearch());

  const [formatOn, setFormatOn] = useState(true);
  const [wrap, setWrap] = useState(false);

  const formatted = useMemo(
    () => (source.data ? formattedJson(name, source.data) : null),
    [name, source.data],
  );
  const shown = formatOn && formatted !== null ? formatted : (source.data?.text ?? "");
  const lines = useMemo(() => lineCount(shown), [shown]);

  if (source.isPending) return <LoadingState />;

  if (source.isError) {
    return (
      <EmptyState
        size="sm"
        className="h-full"
        title={m.workshop_preview_unreadable_title()}
        description={m.workshop_preview_text_unreadable_description({ name })}
      />
    );
  }

  const facts = [
    m.workshop_preview_text_lines_label({ count: lines, formatted: lines.toLocaleString() }),
    formatBytes(source.data.sizeBytes),
  ];

  return (
    <DocumentFrame data-ui="TextPreview">
      {source.data.truncated && (
        <PaneHint>
          {m.workshop_preview_text_truncated_hint({
            shown: formatBytes(MAX_TEXT_BYTES),
            size: formatBytes(source.data.sizeBytes),
          })}
        </PaneHint>
      )}

      <Suspense fallback={<LoadingState />}>
        <CodeView
          ref={code}
          value={shown}
          language={language}
          wrap={wrap}
          label={m.workshop_preview_text_view_label({ name })}
        />
      </Suspense>

      <PreviewStatus facts={facts}>
        {formatted !== null && (
          <Tooltip content={m.workshop_preview_text_format_label()}>
            <Button
              variant="ghost"
              size="xs"
              compact
              aria-pressed={formatOn}
              className={formatOn ? "text-accent-300" : undefined}
              onClick={() => setFormatOn(!formatOn)}
            >
              {m.workshop_preview_text_format_action()}
            </Button>
          </Tooltip>
        )}
        <Tooltip content={m.workshop_preview_text_wrap_label()}>
          <Button
            variant="ghost"
            size="xs"
            compact
            aria-pressed={wrap}
            className={wrap ? "text-accent-300" : undefined}
            onClick={() => setWrap(!wrap)}
          >
            {m.workshop_preview_text_wrap_action()}
          </Button>
        </Tooltip>
      </PreviewStatus>
    </DocumentFrame>
  );
}

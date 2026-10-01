import { useEffect, useId, useState } from "react";

import { EmptyState, Field, Spinner } from "@/components";
import { m } from "@/i18n";
import { useAssetVersion, versionedUrl } from "@/lib/assetVersions";
import { previewFontUrl } from "@/lib/previewUrl";
import type { AssetRef } from "@/lib/tauri";

import { PreviewStatus } from "./PreviewStatus";

/** The sizes the sample is set at, in px. */
const SAMPLE_SIZES = [12, 16, 24, 32, 48, 72] as const;

/** Every glyph a reader checks first, set once under the samples. */
const CHARACTER_SET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 .,;:!?&@#%()[]{}";

type FaceState = "loading" | "ready" | "failed";

interface FontPreviewProps {
  asset: AssetRef;
  /** The file name, which the document resolved. A reference may hold a hash. */
  name: string;
}

/**
 * An OpenType or TrueType font, set in an editable sample at a ladder of sizes.
 *
 * The face loads through `FontFace` under a family name of this tab's own, so two open
 * fonts never take each other's name, and it leaves the document with the tab.
 */
export function FontPreview({ asset, name }: FontPreviewProps) {
  const family = `ltk-preview-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const url = versionedUrl(previewFontUrl(asset), useAssetVersion(asset));
  const [state, setState] = useState<FaceState>("loading");
  const [sample, setSample] = useState<string>(() => m.workshop_preview_font_sample_label());

  useEffect(() => {
    let live = true;
    let face: FontFace | null = null;
    setState("loading");

    /* Fetched rather than named by `url()`, because the webview's font-src takes no
       protocol of the app's own and its connect-src does. */
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((bytes) => {
        face = new FontFace(family, bytes);
        return face.load();
      })
      .then(
        (loaded) => {
          if (!live) return;
          document.fonts.add(loaded);
          setState("ready");
        },
        () => {
          if (live) setState("failed");
        },
      );

    return () => {
      live = false;
      if (face) document.fonts.delete(face);
    };
  }, [family, url]);

  if (state === "failed") {
    return (
      <EmptyState
        size="sm"
        className="h-full"
        title={m.workshop_preview_unreadable_title()}
        description={m.workshop_preview_font_unreadable_description({ name })}
      />
    );
  }

  if (state === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size="md" />
      </div>
    );
  }

  return (
    <div data-ui="FontPreview" className="flex min-h-0 flex-1 flex-col bg-surface-950">
      <div className="shrink-0 border-b border-surface-700/50 px-3 py-2">
        <Field.Root>
          <Field.Control
            type="text"
            value={sample}
            onChange={(event) => setSample(event.target.value)}
            placeholder={m.workshop_preview_font_sample_placeholder()}
            aria-label={m.workshop_preview_font_sample_placeholder()}
            className="h-7 text-xs"
          />
        </Field.Root>
      </div>

      <div
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 py-4 text-surface-100 scrollbar-md"
        style={{ fontFamily: `"${family}"` }}
      >
        {SAMPLE_SIZES.map((size) => (
          <div key={size} className="flex items-baseline gap-4">
            <span className="w-10 shrink-0 text-right font-mono text-xs text-surface-400 select-none">
              {size}
            </span>
            <p className="min-w-0 break-words" style={{ fontSize: size, lineHeight: 1.2 }}>
              {sample}
            </p>
          </div>
        ))}
        <p className="pt-2 break-words text-surface-300" style={{ fontSize: 24 }}>
          {CHARACTER_SET}
        </p>
      </div>

      <PreviewStatus facts={[name]} />
    </div>
  );
}

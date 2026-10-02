import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { useResizeObserver } from "@/hooks";
import { m } from "@/i18n";
import type { BinDocumentId } from "@/lib/tauri";
import { blackTexel, FlatViewport, useSceneColors, whiteTexel } from "@/modules/viewport";

import { Notice } from "../../shared/preview/Notice";
import { uiQueries } from "../api/uiQueries";
import type { Screen } from "../engine/layout/solve";
import { finiteFont, type ViewLook, type ViewStyleSheet } from "../engine/model/view";
import { textDraws } from "../engine/text/draws";
import { WRAP } from "../engine/text/layout";
import { faceOf, fontSizeOf } from "../engine/text/sizing";
import { useUiPrograms } from "../hooks/useAtlasSources";
import { useTextSource } from "../hooks/useTextSource";
import { AtlasFrame } from "../rendering/components/AtlasFrame";
import type { CompositeColors } from "../rendering/utils/composite";
import type { FrameInputs } from "../rendering/utils/frameRenderer";
import { useFontSample, useScreenPreset } from "../state/atlasPreview";

export interface FontPreviewProps {
  readonly document: BinDocumentId;
  /** The `GameFontDescription` object, as `0x` and eight digits. */
  readonly entry: string;
}

/** The key the sample is drawn under, as a text's `TRAKey` would name its string. */
const SAMPLE_KEY = "sample";

/** The sample's inset from the pane's edge, in CSS pixels. */
const INSET = 16;

const SAMPLE_LOOK: Extract<ViewLook, { kind: "text" }> = {
  kind: "text",
  font: 0,
  styleSheet: null,
  traKey: SAMPLE_KEY,
  align: [0, 0],
  wrap: WRAP.word,
  flipForRtl: false,
  iconScale: 1,
  minScale: 1,
  color: null,
};

const NO_SHEETS: readonly ViewStyleSheet[] = [];
const NO_MATERIALS: FrameInputs["materials"] = new Map();
const ORIGIN = [0, 0] as const;

/**
 * A `GameFontDescription` drawn as a text draws it: the sample markup laid out and passed
 * through the game's font programs at the size the font picks for the chosen screen, with its
 * shadow, outline and fill.
 *
 * The frame is the pane's size in device pixels and shows one texel per pixel, so each glyph
 * lands as the client rasterizes it.
 */
export function FontPreview({ document, entry }: FontPreviewProps) {
  const query = useQuery({ ...uiQueries.font(document, entry), enabled: entry !== "" });
  const font = useMemo(
    () => (query.data === undefined ? null : finiteFont(query.data)),
    [query.data],
  );
  const fonts = useMemo(() => (font === null ? [] : [font]), [font]);
  const sample = useFontSample();
  const strings = useMemo(() => new Map([[SAMPLE_KEY, sample]]), [sample]);
  const text = useTextSource(fonts, NO_SHEETS, strings);
  const programs = useUiPrograms(document);
  const screen = useScreenPreset();
  const colors = useSceneColors();

  const [frame, setFrame] = useState<Screen | null>(null);
  const [dpr, setDpr] = useState(1);
  const measure = useResizeObserver<HTMLDivElement>((element) => {
    const ratio = window.devicePixelRatio;
    setDpr(ratio);
    setFrame({
      width: Math.max(1, Math.round(element.clientWidth * ratio)),
      height: Math.max(1, Math.round(element.clientHeight * ratio)),
    });
  });

  const frames = useMemo(() => {
    if (font === null || frame === null) return [];

    const inset = Math.round(INSET * dpr);
    const box = {
      x: inset,
      y: inset,
      w: Math.max(0, frame.width - 2 * inset),
      h: Math.max(0, frame.height - 2 * inset),
    };
    const views = { fonts, styleSheets: NO_SHEETS };
    const draws = textDraws(entry, SAMPLE_LOOK, box, null, views, text.source, screen.height);
    text.flush();
    return [{ commands: draws, origin: ORIGIN }];
  }, [font, fonts, frame, dpr, entry, text, screen.height]);

  const inputs = useMemo<FrameInputs>(
    () => ({
      programs,
      textures: new Map(),
      missing: blackTexel(),
      glyphPage: text.glyphPage,
      textTextures: text.textTextures,
      white: whiteTexel(),
      materials: NO_MATERIALS,
    }),
    [programs, text],
  );
  const compositeColors = useMemo<CompositeColors>(
    () => ({ backdrop: colors.backdrop, checkerA: colors.ground, checkerB: colors.grid }),
    [colors],
  );
  const view = useMemo(() => ({ x: 0, y: 0, zoom: 1 / dpr }), [dpr]);

  if (query.error !== null) return <Notice text={m.workshop_bin_atlas_font_error()} />;
  if (font === null) return <Notice text={m.workshop_bin_atlas_font_pending()} />;

  const face = faceOf(font);
  const size = fontSizeOf(font, screen.height);
  return (
    <div
      ref={measure}
      data-ui="FontPreview"
      className="relative min-h-0 flex-1 overflow-hidden select-none"
    >
      {frame !== null && (
        <FlatViewport animating={false}>
          <AtlasFrame
            frames={frames}
            inputs={inputs}
            screen={frame}
            view={view}
            colors={compositeColors}
            live={0}
            playing={false}
            onAnimating={ignore}
          />
        </FlatViewport>
      )}
      <span className="absolute bottom-2 left-3 text-meta text-surface-400">
        {m.workshop_bin_atlas_font_caption({
          face: fileName(face?.regular.path ?? ""),
          size: Math.round(size.pixels * 10) / 10,
          height: screen.height,
        })}
      </span>
    </div>
  );
}

function ignore(): void {}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

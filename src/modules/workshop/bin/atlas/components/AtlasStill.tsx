import { useThree } from "@react-three/fiber";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import type { BinDocumentId } from "@/lib/tauri";
import { blackTexel, type TextureProgress, useSceneColors, whiteTexel } from "@/modules/viewport";

import { uiQueries } from "../api/uiQueries";
import { rectsOf, unionOf } from "../canvas/canvasGeometry";
import { buildCommands, type PreviewState, visibleElements } from "../engine/commands/build";
import type { Command } from "../engine/commands/types";
import type { PixelRect, Screen } from "../engine/layout/solve";
import { NO_OVERLAY } from "../engine/model/combo";
import { meterFills } from "../engine/model/meters";
import { repeatClones, viewRepeats, withClones } from "../engine/model/repeats";
import { subtreeOf } from "../engine/model/tree";
import {
  finiteFont,
  type ViewFont,
  type ViewLook,
  type ViewStyleSheet,
} from "../engine/model/view";
import { hiddenScenesOf } from "../engine/model/visibility";
import { textDraws } from "../engine/text/draws";
import { WRAP } from "../engine/text/layout";
import { useAtlasLayout } from "../hooks/useAtlasLayout";
import { useUiPrograms, useUiProgramsSettled, useUiTextures } from "../hooks/useAtlasSources";
import { type TextSources, useTextSource, useViewStrings } from "../hooks/useTextSource";
import { AtlasFrame } from "../rendering/components/AtlasFrame";
import { AtlasParticles } from "../rendering/components/AtlasParticles";
import type { CompositeColors, ViewTransform } from "../rendering/utils/composite";
import type { FrameInputs, ParticleDraw } from "../rendering/utils/frameRenderer";
import { useFontSample, useFrameSettings, useScreenPreset } from "../state/atlasPreview";

/** What a still draws: a view controller's screen, one element and its children, or a font. */
export type AtlasStillKind = "view" | "element" | "font";

/** Where a still stands: loading, drawn and ready to copy, drawing nothing, or unreadable. */
export type AtlasStillStatus = "pending" | "ready" | "empty" | "failed";

export interface AtlasStillProps {
  readonly document: BinDocumentId;
  /** The view controller, the element or the font, as `0x` and eight digits. */
  readonly entry: string;
  readonly kind: AtlasStillKind;
  /** The clock runs, and effects and particles play. */
  readonly playing: boolean;
  readonly onStatus: (status: AtlasStillStatus) => void;
}

/** The share of the surface a fitted still fills. */
const VIEW_SHARE = 1;
const ELEMENT_SHARE = 0.9;
/** The fill a meter draws in a still, as samples draw it. */
const STILL_FILL = 0.65;
/** The font sample's inset from the surface's edge, in CSS pixels. */
const FONT_INSET = 24;

const NO_FONTS: readonly ViewFont[] = [];
const NO_SHEETS: readonly ViewStyleSheet[] = [];
const NONE: ReadonlySet<string> = new Set();
const NO_MATERIALS: FrameInputs["materials"] = new Map();
const NO_STATES: ReadonlyMap<string, string> = new Map();
const NO_COMMANDS: Command[] = [];
const ORIGIN = [0, 0] as const;

/**
 * A read-only frame of the Atlas renderer for a surface that already holds a canvas, such as the
 * object browser's preview pool. Draws inside a react-three-fiber canvas, fitted to its size,
 * with the preview's defaults and no interaction, and reports through `onStatus` once every
 * texture, program and font it samples has landed.
 */
export function AtlasStill(props: AtlasStillProps) {
  if (props.kind === "font") return <FontStill {...props} />;
  return <ViewStill {...props} />;
}

function ViewStill({ document, entry, kind, playing, onStatus }: AtlasStillProps) {
  const focus = kind === "element";
  const { view, tree, error, screen, settings, solved } = useAtlasLayout(
    document,
    entry,
    focus ? "scene" : "controller",
  );
  const { live } = useFrameSettings();
  const programs = useUiPrograms(document);
  const programsSettled = useUiProgramsSettled(document);
  const [textureLoad, reportTextures] = useState<TextureProgress | null>(null);
  const { textures, sizes } = useUiTextures(view, reportTextures);
  const strings = useViewStrings(view);
  const text = useTextSource(view?.fonts ?? NO_FONTS, view?.styleSheets ?? NO_SHEETS, strings);
  const [particleDraws] = useState(() => new Map<string, ParticleDraw>());

  const only = useMemo(
    () => (focus && tree !== null ? subtreeOf(tree, entry) : null),
    [focus, tree, entry],
  );
  const commands = useMemo(() => {
    if (tree === null || solved === null) return NO_COMMANDS;

    const preview: PreviewState = {
      hiddenScenes: focus ? NONE : hiddenScenesOf(tree, NONE, false),
      buttonStates: NO_STATES,
      meterFills: meterFills(tree, { own: {}, samples: true, live: STILL_FILL }),
      showDisabled: false,
      hiddenElements: NONE,
      effects: true,
      samples: true,
      only,
      overlay: NO_OVERLAY,
    };
    const order = visibleElements(tree, preview);
    const repeats = focus ? [] : viewRepeats(tree, solved);
    const clones = repeatClones(tree, solved, repeats, new Set(order));
    const built = buildCommands({
      tree,
      solved,
      settings,
      preview: { ...preview, overlay: withClones(NO_OVERLAY, clones) },
      textureSizes: sizes,
      text: text.source,
    });
    text.flush();
    return built;
  }, [tree, solved, settings, sizes, text, focus, only]);

  const target = useMemo(() => {
    const drawn = only === null || solved === null ? [] : rectsOf(solved, [...only]);
    return unionOf(drawn.filter((rect) => rect.w > 0 && rect.h > 0));
  }, [only, solved]);
  const whole = useMemo(() => wholeOf(screen), [screen]);

  const texturesSettled =
    view !== null &&
    (view.textures.every((each) => each.asset === null) || textureLoad?.pending === 0);
  let status: AtlasStillStatus = "pending";
  if (error !== null) status = "failed";
  else if (tree !== null && tree.scenes.size === 0) status = "empty";
  else if (tree !== null && programsSettled && texturesSettled && text.settled) {
    status = commands.length === 0 || (focus && target === null) ? "empty" : "ready";
  }
  useStatus(status, onStatus);

  const frame = focus ? target : null;
  return (
    <>
      <StillFrame
        commands={commands}
        programs={programs}
        text={text}
        textures={textures}
        screen={screen}
        target={frame ?? whole}
        share={frame === null ? VIEW_SHARE : ELEMENT_SHARE}
        live={live}
        playing={playing}
        particles={particleDraws}
      />
      <AtlasParticles commands={commands} screen={screen} playing={playing} draws={particleDraws} />
    </>
  );
}

const SAMPLE_KEY = "sample";

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

/** A font's sample laid out in a frame of the surface's own pixels, as `FontPreview` draws it. */
function FontStill({ document, entry, onStatus }: AtlasStillProps) {
  const query = useQuery({ ...uiQueries.font(document, entry), enabled: entry !== "" });
  const font = useMemo(
    () => (query.data === undefined ? null : finiteFont(query.data)),
    [query.data],
  );
  const fonts = useMemo(() => (font === null ? NO_FONTS : [font]), [font]);
  const sample = useFontSample();
  const strings = useMemo(() => new Map([[SAMPLE_KEY, sample]]), [sample]);
  const text = useTextSource(fonts, NO_SHEETS, strings);
  const programs = useUiPrograms(document);
  const programsSettled = useUiProgramsSettled(document);
  const preset = useScreenPreset();
  const size = useThree((state) => state.size);
  const screen = useMemo<Screen>(
    () => ({ width: Math.max(1, size.width), height: Math.max(1, size.height) }),
    [size.width, size.height],
  );
  const whole = useMemo(() => wholeOf(screen), [screen]);

  const commands = useMemo(() => {
    if (font === null) return NO_COMMANDS;

    const box = {
      x: FONT_INSET,
      y: FONT_INSET,
      w: Math.max(0, screen.width - 2 * FONT_INSET),
      h: Math.max(0, screen.height - 2 * FONT_INSET),
    };
    const views = { fonts, styleSheets: NO_SHEETS };
    const draws = textDraws(entry, SAMPLE_LOOK, box, null, views, text.source, preset.height);
    text.flush();
    return draws;
  }, [font, fonts, screen, entry, text, preset.height]);

  let status: AtlasStillStatus = "pending";
  if (query.error !== null) status = "failed";
  else if (font !== null && programsSettled && text.settled) {
    status = commands.length === 0 ? "empty" : "ready";
  }
  useStatus(status, onStatus);

  return (
    <StillFrame
      commands={commands}
      programs={programs}
      text={text}
      textures={NO_TEXTURES}
      screen={screen}
      target={whole}
      share={1}
      live={0}
      playing={false}
    />
  );
}

const NO_TEXTURES: FrameInputs["textures"] = new Map();

interface StillFrameProps {
  readonly commands: Command[];
  readonly programs: FrameInputs["programs"];
  readonly text: TextSources;
  readonly textures: FrameInputs["textures"];
  readonly screen: Screen;
  /** The part of the frame fitted to the surface. */
  readonly target: PixelRect;
  readonly share: number;
  readonly live: number;
  readonly playing: boolean;
  readonly particles?: ReadonlyMap<string, ParticleDraw>;
}

/** The frame composited onto the canvas with `target` fitted and centred. */
function StillFrame({
  commands,
  programs,
  text,
  textures,
  screen,
  target,
  share,
  live,
  playing,
  particles,
}: StillFrameProps) {
  const size = useThree((state) => state.size);
  const colors = useSceneColors();
  const inputs = useMemo<FrameInputs>(
    () => ({
      programs,
      textures,
      missing: blackTexel(),
      glyphPage: text.glyphPage,
      textTextures: text.textTextures,
      white: whiteTexel(),
      /* A still draws an icon material with its UI program, which reads no material. */
      materials: NO_MATERIALS,
    }),
    [programs, textures, text],
  );
  const compositeColors = useMemo<CompositeColors>(
    () => ({ backdrop: colors.backdrop, checkerA: colors.ground, checkerB: colors.grid }),
    [colors],
  );
  const frames = useMemo(() => [{ commands, origin: ORIGIN }], [commands]);
  const view = useMemo(
    () => fitted(target, size.width, size.height, share),
    [target, size.width, size.height, share],
  );

  return (
    <AtlasFrame
      frames={frames}
      inputs={inputs}
      screen={screen}
      view={view}
      colors={compositeColors}
      live={live}
      playing={playing}
      onAnimating={ignore}
      particles={particles}
    />
  );
}

/** `target` centred in a surface of `size` CSS pixels, filling `share` of it. */
function fitted(target: PixelRect, width: number, height: number, share: number): ViewTransform {
  const w = Math.max(target.w, 1);
  const h = Math.max(target.h, 1);
  const zoom = Math.min(width / w, height / h) * share;
  return {
    x: width / 2 - (target.x + w / 2) * zoom,
    y: height / 2 - (target.y + h / 2) * zoom,
    zoom,
  };
}

function wholeOf(screen: Screen): PixelRect {
  return { x: 0, y: 0, w: screen.width, h: screen.height };
}

/** Tell `onStatus` each status once, as it changes. */
function useStatus(status: AtlasStillStatus, onStatus: (status: AtlasStillStatus) => void) {
  useEffect(() => {
    onStatus(status);
  }, [status, onStatus]);
}

function ignore(): void {}

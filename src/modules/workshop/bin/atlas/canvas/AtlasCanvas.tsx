import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ContextMenu } from "@/components";
import { useResizeObserver } from "@/hooks";
import { m } from "@/i18n";
import type { BinDocumentId } from "@/lib/tauri";
import { blackTexel, FlatViewport, useSceneColors, whiteTexel } from "@/modules/viewport";

import { Notice } from "../../vfx/preview/components/Notice";
import { ElementMenu } from "../components/ElementMenu";
import { buildCommands, type PreviewState, visibleElements } from "../engine/commands/build";
import { layerEdits, resizeBlock } from "../engine/edit/targets";
import type { PixelRect, Screen } from "../engine/layout/solve";
import { labelOf } from "../engine/model/layers";
import { subtreeOf, type ViewTree } from "../engine/model/tree";
import type { ViewFont, ViewStyleSheet } from "../engine/model/view";
import { useAtlasLayout } from "../hooks/useAtlasLayout";
import { useUiPrograms, useUiTextures } from "../hooks/useAtlasSources";
import { useHiddenScenes } from "../hooks/useHiddenScenes";
import { useTextSource, useViewStrings } from "../hooks/useTextSource";
import { AtlasFrame } from "../rendering/components/AtlasFrame";
import { AtlasParticles } from "../rendering/components/AtlasParticles";
import type { CompositeColors } from "../rendering/utils/composite";
import type { FrameInputs, ParticleDraw } from "../rendering/utils/frameRenderer";
import { type AtlasEdit, useAtlasEdit } from "../state/atlasEdit";
import {
  useAtlasPreviewActions,
  useFrameRequest,
  useFrameSettings,
  useHovered,
  useViewPreview,
  viewKey,
} from "../state/atlasPreview";
import { canvasKey } from "./canvasKeys";
import { type CanvasEditing, CanvasStatus } from "./CanvasStatus";
import { FrameOverlay } from "./FrameOverlay";
import { previewKey } from "./previewKeys";
import { useButtonPlay } from "./useButtonPlay";
import { useCanvasEdit } from "./useCanvasEdit";
import { useComboPlay } from "./useComboPlay";
import { useMeterPlay } from "./useMeterPlay";
import { useViewTransform, type ViewTransformControl } from "./useViewTransform";

export interface AtlasCanvasProps {
  readonly document: BinDocumentId;
  /** The view controller object, or the focused element, as `0x` and eight digits. */
  readonly entry: string;
  /**
   * Draw the element at `entry` and the elements under it alone, out of the scene bin open as
   * `document`, fitted to it and with every scene shown.
   */
  readonly focus?: boolean;
}

/** How many source pixels an arrow key nudges by, and with Shift held. */
const NUDGE = 1;
const NUDGE_FAR = 10;

const NO_FONTS: readonly ViewFont[] = [];
const NO_SHEETS: readonly ViewStyleSheet[] = [];
const NO_SCENES: ReadonlySet<string> = new Set();

/**
 * The canvas pane: the view laid out for the chosen screen and drawn with the game's own UI
 * programs, per "The engine" in docs/plans/atlas-ui-editor.md.
 *
 * The wheel zooms about the pointer and a double click fits the frame again. Picking, moving,
 * resizing, the marquee and panning are `useCanvasEdit`'s. A right click picks the element under
 * the pointer and opens its menu. The keys are F to frame the selection, 0 to fit, 1 for 100%,
 * plus and minus to zoom, the arrows to nudge by a source pixel or ten with Shift, the brackets
 * to move the selection up and down its siblings' draw order, all the way with Shift, and Escape
 * to clear the selection. The marks over the frame are `FrameOverlay`'s.
 */
export function AtlasCanvas({ document, entry, focus = false }: AtlasCanvasProps) {
  const source = focus ? "scene" : "controller";
  const { view, tree, error, pending, screen, settings, solved } = useAtlasLayout(
    document,
    entry,
    source,
  );
  const programs = useUiPrograms(document);
  const { textures, sizes } = useUiTextures(view);
  const strings = useViewStrings(view);
  const text = useTextSource(view?.fonts ?? NO_FONTS, view?.styleSheets ?? NO_SHEETS, strings);
  const frame = useFrameSettings();
  const key = viewKey(document, entry);
  const { selected, selection } = useViewPreview(key);
  const restingScenes = useHiddenScenes(tree, key);
  const hiddenScenes = focus ? NO_SCENES : restingScenes;
  const only = useMemo(
    () => (focus && tree !== null ? subtreeOf(tree, entry) : null),
    [focus, tree, entry],
  );
  const hovered = useHovered();
  const previewActions = useAtlasPreviewActions();
  const { select, setHovered, setPointer } = previewActions;
  const colors = useSceneColors();
  const edit = useAtlasEdit();
  const [animating, setAnimating] = useState(false);
  const [menuElement, setMenuElement] = useState<string | null>(null);
  const [particleDraws] = useState(() => new Map<string, ParticleDraw>());

  const [pane, setPane] = useState<Screen | null>(null);
  const measure = useResizeObserver<HTMLDivElement>((element) => {
    setPane({ width: element.clientWidth, height: element.clientHeight });
  });
  const transform = useViewTransform(screen, pane, focus ? (solved?.get(entry) ?? null) : null);
  const play = useComboPlay({ view: key, tree, solved, strings, toScreen: transform.toScreen });
  const buttons = useButtonPlay({ view: key, tree, solved, toScreen: transform.toScreen });
  const meters = useMeterPlay({ view: key, tree, solved, toScreen: transform.toScreen });
  const interact = frame.interact;

  const preview = useMemo<PreviewState>(
    () => ({
      hiddenScenes,
      buttonStates: buttons.states,
      meterFills: meters.fills,
      showDisabled: frame.showDisabled,
      samples: frame.samples,
      only,
      overlay: play.overlay,
    }),
    [
      hiddenScenes,
      buttons.states,
      meters.fills,
      frame.showDisabled,
      frame.samples,
      only,
      play.overlay,
    ],
  );
  const order = useMemo(
    () => (tree === null ? [] : visibleElements(tree, preview)),
    [tree, preview],
  );
  const canvas = useCanvasEdit({
    tree,
    solved,
    settings,
    order,
    view: key,
    selection,
    primary: selected,
    transform,
    edit,
    safeZone: frame.safeZone,
  });
  const shown = canvas.shown;

  const commands = useMemo(() => {
    if (tree === null || shown === null) return [];

    const built = buildCommands({
      tree,
      solved: shown,
      settings,
      preview,
      textureSizes: sizes,
      text: text.source,
    });
    text.flush();
    return built;
  }, [tree, shown, settings, preview, sizes, text]);
  const placeholders = useMemo(
    () =>
      frame.samples && tree !== null && shown !== null ? placeholderRects(tree, shown, order) : [],
    [frame.samples, tree, shown, order],
  );
  const inputs = useMemo<FrameInputs>(
    () => ({
      programs,
      textures,
      missing: blackTexel(),
      glyphPage: text.glyphPage,
      textTextures: text.textTextures,
      white: whiteTexel(),
    }),
    [programs, textures, text],
  );
  const compositeColors = useMemo<CompositeColors>(
    () => ({ backdrop: colors.backdrop, checkerA: colors.ground, checkerB: colors.grid }),
    [colors],
  );

  useFraming(key, shown, transform);

  const onWheel = transform.onWheel;
  const hold = useCallback(
    (element: HTMLDivElement) => {
      const unmeasure = measure(element);
      element.addEventListener("wheel", onWheel, { passive: false });
      return () => {
        element.removeEventListener("wheel", onWheel);
        if (typeof unmeasure === "function") unmeasure();
      };
    },
    [measure, onWheel],
  );

  const pointAt = (event: ReactMouseEvent) => {
    const box = event.currentTarget.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top] as const;
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === " ") {
      canvas.holdSpace(true);
      event.preventDefault();
      return;
    }
    if (previewKey(event.key, previewActions)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const step = event.shiftKey ? NUDGE_FAR : NUDGE;
    const run = canvasKey(event.key, {
      transform,
      selected: selected === null ? null : (shown?.get(selected) ?? null),
      clear: () => select(key, null),
      nudge: (dx, dy) => canvas.nudge(dx * step, dy * step),
      arrange: (layerStep) => {
        if (tree !== null && selected !== null && edit?.editable === true) {
          void edit.apply(layerEdits(tree, selected, layerStep));
        }
      },
    });
    if (!run) return;

    event.preventDefault();
    event.stopPropagation();
  };

  if (error !== null) return <Notice text={m.workshop_bin_atlas_view_error()} />;
  if (pending || tree === null) return <Notice text={m.workshop_bin_atlas_view_pending()} />;

  const selectedElement = selected === null ? undefined : tree.elements.get(selected);
  const editing = editingOf(edit, tree, selection);
  const others = selection.flatMap((each) => {
    const rect = each === selected ? undefined : shown?.get(each);
    return rect === undefined ? [] : [rect];
  });

  return (
    <div data-ui="AtlasCanvas" className="flex min-h-0 flex-1 flex-col">
      <ContextMenu.Root>
        <ContextMenu.Trigger
          ref={hold}
          data-ui="AtlasCanvas:surface"
          tabIndex={0}
          aria-label={m.workshop_bin_atlas_canvas_label()}
          className="relative min-h-0 flex-1 overflow-hidden outline-none select-none focus-visible:ring-1 focus-visible:ring-accent-500/60 focus-visible:ring-inset"
          style={{
            cursor: interactCursor(
              interact,
              play.pointing || buttons.pointing || meters.pointing,
              canvas.cursor,
            ),
          }}
          onContextMenuCapture={(event) => {
            const [x, y] = pointAt(event);
            const under = canvas.pick(x, y);
            setMenuElement(under);
            if (under !== null && !selection.includes(under)) select(key, under);
          }}
          onPointerDown={(event) => {
            /* Interact mode plays the view with the primary button, and pans with the others. */
            if (interact && event.button === 0) {
              const [x, y] = pointAt(event);
              play.click(x, y);
              buttons.down(x, y);
              meters.down(x, y);
              return;
            }
            canvas.onPointerDown(event);
          }}
          onPointerMove={(event) => {
            const [x, y] = pointAt(event);
            setPointer(transform.toScreen(x, y));
            canvas.onPointerMove(event);
            if (interact) {
              play.move(x, y);
              buttons.move(x, y);
              meters.move(x, y);
              return;
            }

            const under = canvas.pick(x, y);
            if (under !== hovered) setHovered(under);
          }}
          onPointerUp={(event) => {
            buttons.up();
            meters.up();
            canvas.onPointerUp(event);
          }}
          onPointerLeave={() => {
            setHovered(null);
            setPointer(null);
            play.leave();
            buttons.leave();
            meters.leave();
          }}
          onDoubleClick={transform.fit}
          onKeyDown={onKeyDown}
          onKeyUp={(event) => {
            if (event.key === " ") canvas.holdSpace(false);
          }}
          onBlur={() => canvas.holdSpace(false)}
        >
          <FlatViewport animating={animating && frame.playing}>
            <AtlasFrame
              commands={commands}
              inputs={inputs}
              screen={screen}
              view={transform.view}
              colors={compositeColors}
              live={frame.live}
              playing={frame.playing}
              onAnimating={setAnimating}
              particles={particleDraws}
            />
            <AtlasParticles
              commands={commands}
              screen={screen}
              playing={frame.playing}
              draws={particleDraws}
            />
          </FlatViewport>
          <FrameOverlay
            view={transform.view}
            screen={screen}
            safeZone={frame.safeZone}
            placeholders={placeholders}
            hovered={hovered === null || interact ? null : (shown?.get(hovered) ?? null)}
            selected={selected === null || interact ? null : (shown?.get(selected) ?? null)}
            others={interact ? [] : others}
            handles={!interact && canvas.handles}
            marquee={canvas.marquee}
            guides={canvas.guides}
          />
        </ContextMenu.Trigger>
        <ElementMenu
          document={document}
          entry={entry}
          source={source}
          element={menuElement}
          canvas
        />
      </ContextMenu.Root>
      <CanvasStatus
        transform={transform}
        selection={
          selectedElement === undefined
            ? null
            : {
                label: labelOf(selectedElement.label, selectedElement.path, selectedElement.key),
                rect: shown?.get(selectedElement.key) ?? null,
                count: selection.length,
              }
        }
        editing={editing}
      />
    </div>
  );
}

/** The canvas's cursor: interact mode points at what a click plays, and editing has its own. */
function interactCursor(interact: boolean, pointing: boolean, editing: string): string {
  if (!interact) return editing;
  return pointing ? "pointer" : "default";
}

/** Frame the element a request for this view names, or fit the screen for a request naming none. */
function useFraming(
  key: string,
  solved: ReadonlyMap<string, PixelRect> | null,
  transform: ViewTransformControl,
) {
  const request = useFrameRequest();
  const answered = useRef(request?.token ?? 0);

  useEffect(() => {
    if (request === null || request.view !== key || request.token === answered.current) return;

    answered.current = request.token;
    if (request.element === null) {
      transform.fit();
      return;
    }

    const rect = solved?.get(request.element);
    if (rect !== undefined) transform.frame(rect);
  }, [request, key, solved, transform]);
}

/** How the canvas takes edits, for the status strip. */
function editingOf(
  edit: AtlasEdit | null,
  tree: ViewTree,
  selection: readonly string[],
): CanvasEditing {
  if (edit === null || edit.scene === null) return { kind: "none" };
  if (!edit.editable) return { kind: "readOnly", reason: edit.readOnly };
  return { kind: "edit", block: resizeBlock(tree, selection), selected: selection.length > 0 };
}

/**
 * The rects of the shown icons and effects whose image the controller sets at run time, which
 * draw as a placeholder, per section 6 of the editor plan.
 */
function placeholderRects(
  tree: ViewTree,
  solved: ReadonlyMap<string, PixelRect>,
  order: readonly string[],
): PixelRect[] {
  const rects: PixelRect[] = [];
  for (const key of order) {
    const look = tree.elements.get(key)?.look;
    if ((look?.kind !== "icon" && look?.kind !== "effect") || look.sprite !== null) continue;

    const rect = solved.get(key);
    if (rect !== undefined && rect.w > 0 && rect.h > 0) rects.push(rect);
  }
  return rects;
}

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import { m } from "@/i18n";
import { keepUnversioned, localJsonStorage } from "@/stores/storage";

import { type FrameChoices, NO_FRAME_CHOICES } from "../engine/layout/frames";
import type { Screen } from "../engine/layout/solve";
import { BUTTON_STATES, type ButtonState } from "../engine/model/buttons";
import { CLOSED_COMBO, type ComboState } from "../engine/model/combo";
import {
  DEFAULT_TOOLTIP_CHARACTER,
  DEFAULT_TOOLTIP_SAMPLE,
  FIRST_RANK,
  MAX_CHARACTER_LEVEL,
  NO_CHARACTER_LEVEL,
} from "../engine/model/tooltip";

/** A screen the canvas lays a view out for, per "Panes" in docs/plans/atlas-ui-editor.md. */
export interface ScreenPreset extends Screen {
  readonly id: string;
  /** The aspect as a player names it. */
  readonly aspect: string;
}

export const SCREEN_PRESETS: readonly ScreenPreset[] = [
  { id: "720p", aspect: "16:9", width: 1280, height: 720 },
  { id: "1080p", aspect: "16:9", width: 1920, height: 1080 },
  { id: "1440p", aspect: "16:9", width: 2560, height: 1440 },
  { id: "1200p", aspect: "16:10", width: 1920, height: 1200 },
  { id: "ultrawide", aspect: "21:9", width: 3440, height: 1440 },
  { id: "4:3", aspect: "4:3", width: 1600, height: 1200 },
];

const DEFAULT_PRESET = "1080p";

/** What `B` steps through: each button's own state, then every state forced on all of them. */
const BUTTON_CYCLE: readonly (ButtonState | null)[] = [null, ...BUTTON_STATES];

/** The button under the pointer in a view's canvas while it plays, and the one held down. */
export interface ButtonPointer {
  readonly view: string;
  readonly hovered: string | null;
  readonly pressed: string | null;
}

/** The client clamps its HUD scale factor between these, per research section 11. */
export const HUD_MIN = 0.66;
export const HUD_MAX = 1;

/** The inset a safe zone takes off each edge while shown, as a fraction of the screen. */
export const SAFE_ZONE_INSET = 0.05;

/** A view's preview state, which nothing writes to the file. */
interface ViewPreview {
  /** The scenes the reader switched against their resting state, `hiddenScenesOf`'s `flipped`. */
  readonly flippedScenes: ReadonlySet<string>;
  /** The elements the reader hid, each with everything a group of them holds. */
  readonly hiddenElements: ReadonlySet<string>;
  /** Every selected element, the primary one last. */
  readonly selection: readonly string[];
  /** The primary selection, which the inspector shows and a resize drags. */
  readonly selected: string | null;
  /** The override slot drawn over the base, and null for the base alone. */
  readonly variant: string | null;
  /** Each combo box's preview state by its key, `CLOSED_COMBO` where it has none. */
  readonly combos: Readonly<Record<string, ComboState>>;
  /** The fill the reader set on each meter by its key, 0 to 1. */
  readonly meters: Readonly<Record<string, number>>;
  /** The frame the reader drew each scene on, `frameHeads`'s `choices`. */
  readonly frames: FrameChoices;
}

const EMPTY_VIEW: ViewPreview = {
  flippedScenes: new Set(),
  hiddenElements: new Set(),
  selection: [],
  selected: null,
  variant: null,
  combos: {},
  meters: {},
  frames: NO_FRAME_CHOICES,
};

/** The combo box row under the pointer while the canvas is in interact mode. */
export interface ComboHover {
  readonly view: string;
  readonly combo: string;
  readonly option: number;
}

/** A request for the canvas of `view` to frame `element`, or to fit the screen where it is null. */
export interface FrameRequest {
  readonly view: string;
  readonly element: string | null;
  /** Counts up, so asking twice for one element frames it twice. */
  readonly token: number;
}

interface AtlasPreviewStore {
  preset: string;
  hud: number;
  safeZone: boolean;
  /** Every scene and effect a view rests with off draws too. */
  showDisabled: boolean;
  /** The effect and particle elements draw. */
  effects: boolean;
  /** What the controller fills at run time draws sample content, per section 6 of the editor plan. */
  samples: boolean;
  /** Every scene draws on one screen as the client stacks them, rather than on a frame of its own. */
  stackScenes: boolean;
  /** The state every button is forced into, null for each button's own. */
  buttonState: ButtonState | null;
  buttonPointer: ButtonPointer | null;
  /** The live input of every effect, 0 to 1: a cooldown's progress, a fill's percentage. */
  live: number;
  playing: boolean;
  /** The canvas plays the view's widgets under the pointer instead of editing it. */
  interact: boolean;
  comboHover: ComboHover | null;
  /** The element under the pointer, on the canvas or in the layers pane. */
  hovered: string | null;
  /** The screen pixel under the pointer on the canvas. */
  pointer: readonly [number, number] | null;
  /** Each open view's scene toggles and selection, by `document:entry`. */
  views: Readonly<Record<string, ViewPreview>>;
  /** The markup a font preview draws, and null for the default sample. */
  fontSample: string | null;
  /** The id of the sample a tooltip is filled with while samples draw, per `tooltipSamples`. */
  tooltipSample: string;
  /** The character, such as `Ahri`, whose abilities a tooltip's samples are. */
  tooltipCharacter: string;
  /** The level the samples read their values at, 0 for no character at all. */
  tooltipLevel: number;
  /** The rank each sample's ability reads its values at, from 1, its top rank where it has fewer. */
  tooltipRank: number;
  /** The samples show the tooltip Shift shows. */
  tooltipExtended: boolean;
  /** Shift is held over the canvas, which shows the tooltip Shift shows while it lasts. */
  shiftHeld: boolean;
  framing: FrameRequest | null;
  /** The inspector sections the reader folded shut, by id. */
  foldedSections: readonly string[];
  setPreset: (preset: string) => void;
  setHud: (hud: number) => void;
  toggleSafeZone: () => void;
  toggleShowDisabled: () => void;
  toggleEffects: () => void;
  toggleSamples: () => void;
  toggleStackScenes: () => void;
  setButtonState: (state: ButtonState | null) => void;
  /** Force the next state of `BUTTON_CYCLE` on every button. */
  cycleButtonState: () => void;
  setButtonPointer: (pointer: ButtonPointer | null) => void;
  setLive: (live: number) => void;
  togglePlaying: () => void;
  toggleInteract: () => void;
  /** Leave interact mode for the transform tool, which selects, moves and resizes. */
  chooseTransform: () => void;
  /** Change the combo box `combo` of `view`, and close every other one a change opens past. */
  setCombo: (view: string, combo: string, change: Partial<ComboState>) => void;
  setComboHover: (hover: ComboHover | null) => void;
  /** Fill the meter `meter` of `view` to `fill`, or give it back its own fill where it is null. */
  setMeter: (view: string, meter: string, fill: number | null) => void;
  setHovered: (key: string | null) => void;
  setPointer: (pointer: readonly [number, number] | null) => void;
  toggleScene: (view: string, scene: string) => void;
  /** Hide the element `element` of `view` in the preview, or show it again. */
  toggleElement: (view: string, element: string) => void;
  /** Draw the scenes of `view` on the frames `frames` names. */
  setFrames: (view: string, frames: FrameChoices) => void;
  /** Select `element` alone, or nothing where it is null. */
  select: (view: string, element: string | null) => void;
  /** Add `element` to the selection as its primary, or take it out where it is in it. */
  toggleSelected: (view: string, element: string) => void;
  setSelection: (view: string, elements: readonly string[]) => void;
  /** Draw the override in `slot` over the base of `view`, or the base alone where it is null. */
  setVariant: (view: string, slot: string | null) => void;
  setFontSample: (sample: string | null) => void;
  setTooltipSample: (sample: string) => void;
  setTooltipCharacter: (character: string) => void;
  setTooltipLevel: (level: number) => void;
  setTooltipRank: (rank: number) => void;
  toggleTooltipExtended: () => void;
  setShiftHeld: (held: boolean) => void;
  requestFrame: (view: string, element: string | null) => void;
  toggleSection: (id: string) => void;
}

export const useAtlasPreviewStore = create<AtlasPreviewStore>()(
  persist(
    (set) => ({
      preset: DEFAULT_PRESET,
      hud: HUD_MAX,
      safeZone: false,
      showDisabled: false,
      effects: true,
      samples: true,
      stackScenes: false,
      buttonState: null,
      buttonPointer: null,
      live: 0.5,
      playing: false,
      interact: false,
      comboHover: null,
      hovered: null,
      pointer: null,
      views: {},
      fontSample: null,
      tooltipSample: DEFAULT_TOOLTIP_SAMPLE,
      tooltipCharacter: DEFAULT_TOOLTIP_CHARACTER,
      tooltipLevel: NO_CHARACTER_LEVEL,
      tooltipRank: FIRST_RANK,
      tooltipExtended: false,
      shiftHeld: false,
      framing: null,
      foldedSections: [],
      setPreset: (preset) => set({ preset }),
      setHud: (hud) => set({ hud: Math.min(HUD_MAX, Math.max(HUD_MIN, hud)) }),
      toggleSafeZone: () => set((state) => ({ safeZone: !state.safeZone })),
      toggleShowDisabled: () => set((state) => ({ showDisabled: !state.showDisabled })),
      toggleEffects: () => set((state) => ({ effects: !state.effects })),
      toggleSamples: () => set((state) => ({ samples: !state.samples })),
      toggleStackScenes: () => set((state) => ({ stackScenes: !state.stackScenes })),
      setButtonState: (buttonState) => set({ buttonState }),
      cycleButtonState: () =>
        set((state) => {
          const at = BUTTON_CYCLE.indexOf(state.buttonState);
          return { buttonState: BUTTON_CYCLE[(at + 1) % BUTTON_CYCLE.length] };
        }),
      setButtonPointer: (buttonPointer) => set({ buttonPointer }),
      setLive: (live) => set({ live }),
      togglePlaying: () => set((state) => ({ playing: !state.playing })),
      toggleInteract: () => set((state) => ({ interact: !state.interact, comboHover: null })),
      chooseTransform: () => set({ interact: false, comboHover: null }),
      setCombo: (view, combo, change) =>
        set((state) => {
          const held = state.views[view] ?? EMPTY_VIEW;
          const next = { ...(held.combos[combo] ?? CLOSED_COMBO), ...change };
          /* One list is open at a time, as a click outside a list closes it. */
          const others = next.open
            ? Object.fromEntries(
                Object.entries(held.combos).map(([key, each]) => [key, { ...each, open: false }]),
              )
            : held.combos;
          const combos = { ...others, [combo]: next };
          return { views: { ...state.views, [view]: { ...held, combos } } };
        }),
      setComboHover: (comboHover) => set({ comboHover }),
      setMeter: (view, meter, fill) =>
        set((state) => {
          const held = state.views[view] ?? EMPTY_VIEW;
          const { [meter]: _, ...others } = held.meters;
          const meters = fill === null ? others : { ...others, [meter]: fill };
          return { views: { ...state.views, [view]: { ...held, meters } } };
        }),
      setHovered: (hovered) => set({ hovered }),
      setPointer: (pointer) => set({ pointer }),
      toggleScene: (view, scene) =>
        set((state) => {
          const held = state.views[view] ?? EMPTY_VIEW;
          const flippedScenes = new Set(held.flippedScenes);
          if (!flippedScenes.delete(scene)) flippedScenes.add(scene);
          return { views: { ...state.views, [view]: { ...held, flippedScenes } } };
        }),
      toggleElement: (view, element) =>
        set((state) => {
          const held = state.views[view] ?? EMPTY_VIEW;
          const hiddenElements = new Set(held.hiddenElements);
          if (!hiddenElements.delete(element)) hiddenElements.add(element);
          return { views: { ...state.views, [view]: { ...held, hiddenElements } } };
        }),
      setFrames: (view, frames) =>
        set((state) => ({
          views: { ...state.views, [view]: { ...(state.views[view] ?? EMPTY_VIEW), frames } },
        })),
      select: (view, element) =>
        set((state) => selecting(state, view, element === null ? [] : [element])),
      toggleSelected: (view, element) =>
        set((state) => {
          const held = state.views[view]?.selection ?? [];
          const without = held.filter((each) => each !== element);
          return selecting(
            state,
            view,
            without.length < held.length ? without : [...held, element],
          );
        }),
      setSelection: (view, elements) => set((state) => selecting(state, view, elements)),
      setVariant: (view, variant) =>
        set((state) => ({
          views: { ...state.views, [view]: { ...(state.views[view] ?? EMPTY_VIEW), variant } },
        })),
      setFontSample: (fontSample) => set({ fontSample }),
      setTooltipSample: (tooltipSample) => set({ tooltipSample }),
      setTooltipCharacter: (tooltipCharacter) => set({ tooltipCharacter }),
      setTooltipLevel: (level) =>
        set({
          tooltipLevel: Math.min(MAX_CHARACTER_LEVEL, Math.max(NO_CHARACTER_LEVEL, level)),
        }),
      setTooltipRank: (rank) => set({ tooltipRank: Math.max(FIRST_RANK, Math.round(rank)) }),
      toggleTooltipExtended: () => set((state) => ({ tooltipExtended: !state.tooltipExtended })),
      setShiftHeld: (shiftHeld) => set({ shiftHeld }),
      requestFrame: (view, element) =>
        set((state) => ({
          framing: { view, element, token: (state.framing?.token ?? 0) + 1 },
        })),
      toggleSection: (id) =>
        set((state) => ({
          foldedSections: state.foldedSections.includes(id)
            ? state.foldedSections.filter((each) => each !== id)
            : [...state.foldedSections, id],
        })),
    }),
    {
      name: "atlas-preview",
      version: 1,
      migrate: keepUnversioned<AtlasPreviewStore>,
      storage: localJsonStorage,
      partialize: (state) => ({
        preset: state.preset,
        hud: state.hud,
        safeZone: state.safeZone,
        showDisabled: state.showDisabled,
        effects: state.effects,
        samples: state.samples,
        stackScenes: state.stackScenes,
        playing: state.playing,
        fontSample: state.fontSample,
        tooltipSample: state.tooltipSample,
        tooltipCharacter: state.tooltipCharacter,
        tooltipLevel: state.tooltipLevel,
        tooltipRank: state.tooltipRank,
        tooltipExtended: state.tooltipExtended,
        foldedSections: state.foldedSections,
      }),
    },
  ),
);

function selecting(
  state: AtlasPreviewStore,
  view: string,
  selection: readonly string[],
): Pick<AtlasPreviewStore, "views"> {
  const held = state.views[view] ?? EMPTY_VIEW;
  const selected = selection.at(-1) ?? null;
  return { views: { ...state.views, [view]: { ...held, selection, selected } } };
}

/** The key a view's preview state is held under. */
export function viewKey(document: number, entry: string): string {
  return `${document}:${entry}`;
}

const FALLBACK_PRESET: ScreenPreset = {
  id: DEFAULT_PRESET,
  aspect: "16:9",
  width: 1920,
  height: 1080,
};

/** The chosen screen preset, the default where the stored one is gone. */
export function useScreenPreset(): ScreenPreset {
  const id = useAtlasPreviewStore((state) => state.preset);
  return SCREEN_PRESETS.find((preset) => preset.id === id) ?? FALLBACK_PRESET;
}

export function useViewPreview(view: string): ViewPreview {
  return useAtlasPreviewStore((state) => state.views[view] ?? EMPTY_VIEW);
}

/** The override slot `view` draws over its base, null for the base alone. */
export function useViewVariant(view: string): string | null {
  return useAtlasPreviewStore((state) => state.views[view]?.variant ?? null);
}

export function useHovered(): string | null {
  return useAtlasPreviewStore((state) => state.hovered);
}

/** The layout and effect settings the canvas draws with. */
export function useFrameSettings() {
  return useAtlasPreviewStore(
    useShallow((state) => ({
      hud: state.hud,
      safeZone: state.safeZone,
      showDisabled: state.showDisabled,
      effects: state.effects,
      samples: state.samples,
      tooltipSample: state.tooltipSample,
      stackScenes: state.stackScenes,
      buttonState: state.buttonState,
      live: state.live,
      playing: state.playing,
      interact: state.interact,
    })),
  );
}

/** The button under the pointer in `view`'s canvas and the one held down, null for none. */
export function useButtonPointer(view: string): ButtonPointer | null {
  return useAtlasPreviewStore(
    useShallow((state) => (state.buttonPointer?.view === view ? state.buttonPointer : null)),
  );
}

const NO_METERS: Readonly<Record<string, number>> = {};

/** The fill the reader set on each meter of `view`. */
export function useMeterFills(view: string): Readonly<Record<string, number>> {
  return useAtlasPreviewStore((state) => state.views[view]?.meters ?? NO_METERS);
}

/** The combo box row under the pointer in `view`'s canvas, null for none. */
export function useComboHover(view: string): ComboHover | null {
  return useAtlasPreviewStore(
    useShallow((state) => (state.comboHover?.view === view ? state.comboHover : null)),
  );
}

export function useAtlasPreviewActions() {
  return useAtlasPreviewStore(
    useShallow((state) => ({
      setPreset: state.setPreset,
      setHud: state.setHud,
      toggleSafeZone: state.toggleSafeZone,
      toggleShowDisabled: state.toggleShowDisabled,
      toggleEffects: state.toggleEffects,
      toggleSamples: state.toggleSamples,
      toggleStackScenes: state.toggleStackScenes,
      setButtonState: state.setButtonState,
      cycleButtonState: state.cycleButtonState,
      setButtonPointer: state.setButtonPointer,
      setLive: state.setLive,
      togglePlaying: state.togglePlaying,
      toggleInteract: state.toggleInteract,
      chooseTransform: state.chooseTransform,
      setCombo: state.setCombo,
      setComboHover: state.setComboHover,
      setMeter: state.setMeter,
      setHovered: state.setHovered,
      setPointer: state.setPointer,
      toggleScene: state.toggleScene,
      toggleElement: state.toggleElement,
      setFrames: state.setFrames,
      select: state.select,
      toggleSelected: state.toggleSelected,
      setSelection: state.setSelection,
      setVariant: state.setVariant,
      setFontSample: state.setFontSample,
      setTooltipSample: state.setTooltipSample,
      setTooltipCharacter: state.setTooltipCharacter,
      setTooltipLevel: state.setTooltipLevel,
      setTooltipRank: state.setTooltipRank,
      toggleTooltipExtended: state.toggleTooltipExtended,
      setShiftHeld: state.setShiftHeld,
      requestFrame: state.requestFrame,
      toggleSection: state.toggleSection,
    })),
  );
}

/** Whether the inspector section `id` is open. */
export function useSectionOpen(id: string): boolean {
  return useAtlasPreviewStore((state) => !state.foldedSections.includes(id));
}

/** The markup a font preview draws: the reader's own, or the default sample. */
export function useFontSample(): string {
  const sample = useAtlasPreviewStore((state) => state.fontSample);
  return sample ?? m.workshop_bin_atlas_font_sample_default();
}

/** The last frame request, which the canvas of its view answers. */
export function useFrameRequest(): FrameRequest | null {
  return useAtlasPreviewStore((state) => state.framing);
}

export function usePointer(): readonly [number, number] | null {
  return useAtlasPreviewStore((state) => state.pointer);
}

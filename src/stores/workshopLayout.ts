import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Which edge of the content browser the layers explorer docks to. */
type LayerPanelSide = "left" | "right";
type WadSort = "name" | "size";
/**
 * What opening a file from a tree does to the strip.
 *
 * `append` gives every file its own tab, so a comparison across four textures
 * is four tabs. `replace` keeps one ephemeral tab and reuses it, which suits
 * reading through a directory one file at a time.
 */
type TabOpenMode = "append" | "replace";

interface WorkshopLayoutStore {
  layerPanelSide: LayerPanelSide;
  layerPanelOpen: boolean;
  /** Open state per explorer section, keyed by section id. Absent means default. */
  openSections: Record<string, boolean>;
  /** Body height per explorer section, in px, once a boundary has been dragged. */
  sectionHeights: Record<string, number>;
  /** Sidebar and surface shares of the browser, keyed by panel id. Null until the sash moves. */
  browserSplit: Record<string, number> | null;
  showLayerStats: boolean;
  wadSort: WadSort;
  tabOpenMode: TabOpenMode;
  /**
   * Whether every preview draws its asset on the alpha checkerboard.
   *
   * A display preference and not a viewport, so a modder sets it once and every
   * preview reads it. The zoom and the pan live in one preview instead. A file
   * opened after a 3200% read wants its own whole image first.
   */
  previewCheckered: boolean;
  /**
   * Whether the project bar searches the installed game.
   *
   * The one search source with a cost: the first query of a session builds an
   * index over every archive. A modder who never copies a game file pays
   * nothing for it, and a modder who does gets the whole install in the same
   * box as their own project.
   */
  searchGame: boolean;
  /**
   * Whether Problems draws the lints for Meta changes Riot has not deployed.
   *
   * A mod is not wrong about a schema the running game has not taken, so these
   * are off by default and the panel is about the game the user has. A modder
   * preparing a release for the coming build turns them on and reads them
   * muted, beside the findings that are wrong today.
   */
  forwardLookingMeta: boolean;
  setLayerPanelSide: (layerPanelSide: LayerPanelSide) => void;
  setLayerPanelOpen: (layerPanelOpen: boolean) => void;
  toggleSection: (id: string, open: boolean) => void;
  setSectionHeight: (id: string, height: number) => void;
  setBrowserSplit: (browserSplit: Record<string, number>) => void;
  setShowLayerStats: (showLayerStats: boolean) => void;
  setWadSort: (wadSort: WadSort) => void;
  setTabOpenMode: (tabOpenMode: TabOpenMode) => void;
  setPreviewCheckered: (previewCheckered: boolean) => void;
  setSearchGame: (searchGame: boolean) => void;
  setForwardLookingMeta: (forwardLookingMeta: boolean) => void;
}

export const useWorkshopLayoutStore = create<WorkshopLayoutStore>()(
  persist(
    (set) => ({
      layerPanelSide: "left",
      layerPanelOpen: true,
      openSections: {},
      sectionHeights: {},
      browserSplit: null,
      showLayerStats: true,
      wadSort: "name",
      tabOpenMode: "append",
      previewCheckered: true,
      searchGame: true,
      forwardLookingMeta: false,
      setLayerPanelSide: (layerPanelSide) => set({ layerPanelSide }),
      setLayerPanelOpen: (layerPanelOpen) => set({ layerPanelOpen }),
      toggleSection: (id, open) =>
        set((state) => ({ openSections: { ...state.openSections, [id]: open } })),
      setSectionHeight: (id, height) =>
        set((state) => ({ sectionHeights: { ...state.sectionHeights, [id]: height } })),
      setBrowserSplit: (browserSplit) => set({ browserSplit }),
      setShowLayerStats: (showLayerStats) => set({ showLayerStats }),
      setWadSort: (wadSort) => set({ wadSort }),
      setTabOpenMode: (tabOpenMode) => set({ tabOpenMode }),
      setPreviewCheckered: (previewCheckered) => set({ previewCheckered }),
      setSearchGame: (searchGame) => set({ searchGame }),
      setForwardLookingMeta: (forwardLookingMeta) => set({ forwardLookingMeta }),
    }),
    { name: "ltk-workshop-layout", version: 1 },
  ),
);

export type { LayerPanelSide, TabOpenMode, WadSort };
export const useLayerPanelSide = () => useWorkshopLayoutStore((s) => s.layerPanelSide);
export const useSetLayerPanelSide = () => useWorkshopLayoutStore((s) => s.setLayerPanelSide);
export const useLayerPanelOpen = () => useWorkshopLayoutStore((s) => s.layerPanelOpen);
export const useSetLayerPanelOpen = () => useWorkshopLayoutStore((s) => s.setLayerPanelOpen);
export const useOpenSections = () => useWorkshopLayoutStore((s) => s.openSections);
export const useToggleSection = () => useWorkshopLayoutStore((s) => s.toggleSection);
export const useSectionHeights = () => useWorkshopLayoutStore((s) => s.sectionHeights);
export const useSetSectionHeight = () => useWorkshopLayoutStore((s) => s.setSectionHeight);
export const useBrowserSplit = () => useWorkshopLayoutStore((s) => s.browserSplit);
export const useSetBrowserSplit = () => useWorkshopLayoutStore((s) => s.setBrowserSplit);
export const useShowLayerStats = () => useWorkshopLayoutStore((s) => s.showLayerStats);
export const useSetShowLayerStats = () => useWorkshopLayoutStore((s) => s.setShowLayerStats);
export const useWadSort = () => useWorkshopLayoutStore((s) => s.wadSort);
export const useSetWadSort = () => useWorkshopLayoutStore((s) => s.setWadSort);
export const useTabOpenMode = () => useWorkshopLayoutStore((s) => s.tabOpenMode);
export const useSetTabOpenMode = () => useWorkshopLayoutStore((s) => s.setTabOpenMode);
export const usePreviewCheckered = () => useWorkshopLayoutStore((s) => s.previewCheckered);
export const useSetPreviewCheckered = () => useWorkshopLayoutStore((s) => s.setPreviewCheckered);
export const useSearchGame = () => useWorkshopLayoutStore((s) => s.searchGame);
export const useSetSearchGame = () => useWorkshopLayoutStore((s) => s.setSearchGame);
export const useForwardLookingMeta = () => useWorkshopLayoutStore((s) => s.forwardLookingMeta);
export const useSetForwardLookingMeta = () =>
  useWorkshopLayoutStore((s) => s.setForwardLookingMeta);

import { keepScrollTop, keptScrollTop } from "../../../shared/state/scrollTops";
import { useGameBrowserStore } from "../gameBrowser";

describe("gameBrowser store", () => {
  beforeEach(() => {
    useGameBrowserStore.setState({
      expanded: new Set(),
      shutWadDirs: {},
      revealToken: 0,
      reveal: null,
    });
  });

  describe("toggleExpanded", () => {
    it("opens a directory that was shut", () => {
      useGameBrowserStore.getState().toggleExpanded("assets/characters");
      expect(useGameBrowserStore.getState().expanded).toEqual(new Set(["assets/characters"]));
    });

    it("shuts a directory that was open", () => {
      useGameBrowserStore.setState({ expanded: new Set(["assets/characters"]) });
      useGameBrowserStore.getState().toggleExpanded("assets/characters");
      expect(useGameBrowserStore.getState().expanded).toEqual(new Set());
    });

    it("leaves the other directories alone", () => {
      const store = useGameBrowserStore.getState();
      store.toggleExpanded("assets");
      store.toggleExpanded("data");
      useGameBrowserStore.getState().toggleExpanded("assets");
      expect(useGameBrowserStore.getState().expanded).toEqual(new Set(["data"]));
    });

    /* The tree reads the set on every render, so a mutated one would leave the
       rows it drew standing. */
    it("replaces the set rather than mutating it", () => {
      const before = useGameBrowserStore.getState().expanded;
      useGameBrowserStore.getState().toggleExpanded("assets");
      expect(useGameBrowserStore.getState().expanded).not.toBe(before);
      expect(before.size).toBe(0);
    });
  });

  describe("expand", () => {
    it("opens every directory a reveal has to pass through", () => {
      useGameBrowserStore.setState({ expanded: new Set(["data"]) });
      useGameBrowserStore.getState().expand(["assets", "assets/characters"]);

      expect(useGameBrowserStore.getState().expanded).toEqual(
        new Set(["data", "assets", "assets/characters"]),
      );
    });

    it("keeps the set when every directory is open already", () => {
      useGameBrowserStore.setState({ expanded: new Set(["assets"]) });
      const before = useGameBrowserStore.getState().expanded;

      useGameBrowserStore.getState().expand(["assets"]);

      expect(useGameBrowserStore.getState().expanded).toBe(before);
    });
  });

  describe("collapseSubtree", () => {
    it("collapses a directory and every directory under it, and nothing beside it", () => {
      useGameBrowserStore.setState({
        expanded: new Set(["assets", "assets/characters", "assets/characters/ahri", "assetsx"]),
      });

      useGameBrowserStore.getState().collapseSubtree("assets");

      expect(useGameBrowserStore.getState().expanded).toEqual(new Set(["assetsx"]));
    });

    it("keeps the set when nothing under the directory is expanded", () => {
      useGameBrowserStore.setState({ expanded: new Set(["data"]) });
      const before = useGameBrowserStore.getState().expanded;

      useGameBrowserStore.getState().collapseSubtree("assets");

      expect(useGameBrowserStore.getState().expanded).toBe(before);
    });
  });

  describe("setCollapsedFindDirs", () => {
    it("collapses exactly the given directories of the search results", () => {
      useGameBrowserStore.setState({ shutFind: new Set(["d:old"]) });

      useGameBrowserStore.getState().setCollapsedFindDirs(new Set(["d:a", "d:a/b"]));

      expect(useGameBrowserStore.getState().shutFind).toEqual(new Set(["d:a", "d:a/b"]));
    });
  });

  describe("reveal", () => {
    it("bumps the token per request, so two reveals of one row both land", () => {
      useGameBrowserStore.getState().requestReveal("f:0123456789abcdef");
      useGameBrowserStore.getState().requestReveal("f:0123456789abcdef");

      expect(useGameBrowserStore.getState().reveal).toEqual({
        id: "f:0123456789abcdef",
        token: 2,
      });
    });

    it("drops the request the tree answered", () => {
      useGameBrowserStore.getState().requestReveal("f:0123456789abcdef");
      useGameBrowserStore.getState().settleReveal(1);

      expect(useGameBrowserStore.getState().reveal).toBeNull();
    });

    /* The second tree drawing the index settles the token it answered, which is
       no longer the one owed. */
    it("keeps a request a stale token settles", () => {
      useGameBrowserStore.getState().requestReveal("f:0123456789abcdef");
      useGameBrowserStore.getState().requestReveal("f:fedcba9876543210");
      useGameBrowserStore.getState().settleReveal(1);

      expect(useGameBrowserStore.getState().reveal?.token).toBe(2);
    });
  });

  describe("toggleWadDir", () => {
    it("shuts a directory of one archive alone", () => {
      const store = useGameBrowserStore.getState();
      store.toggleWadDir("Aatrox.wad.client", "d:assets");
      store.toggleWadDir("Ahri.wad.client", "d:data");

      expect(useGameBrowserStore.getState().shutWadDirs).toEqual({
        "Aatrox.wad.client": new Set(["d:assets"]),
        "Ahri.wad.client": new Set(["d:data"]),
      });
    });

    it("opens a directory it had shut", () => {
      useGameBrowserStore.getState().toggleWadDir("Aatrox.wad.client", "d:assets");
      useGameBrowserStore.getState().toggleWadDir("Aatrox.wad.client", "d:assets");

      expect(useGameBrowserStore.getState().shutWadDirs["Aatrox.wad.client"]).toEqual(new Set());
    });
  });

  describe("kept scroll", () => {
    it("reads back what a list was left at", () => {
      keepScrollTop("game-index", 1240);
      expect(keptScrollTop("game-index")).toBe(1240);
    });

    /* A list nobody has scrolled opens at its first row rather than nowhere. */
    it("answers zero for a list it has never seen", () => {
      expect(keptScrollTop("game-wad:Aatrox.wad.client")).toBe(0);
    });

    it("keeps one list's offset out of another's", () => {
      keepScrollTop("game-index", 300);
      keepScrollTop("game-wads", 80);
      expect(keptScrollTop("game-index")).toBe(300);
      expect(keptScrollTop("game-wads")).toBe(80);
    });
  });
});

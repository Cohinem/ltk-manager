// @vitest-environment happy-dom

import { useWorkshopLayoutStore } from "../workshopLayout";

describe("workshopLayout", () => {
  it("drops the former global sort while retaining layout preferences", async () => {
    const migrate = useWorkshopLayoutStore.persist.getOptions().migrate;
    const migrated = await migrate?.(
      {
        explorerSort: { field: "size", direction: "desc" },
        explorerView: "details",
        explorerColumns: { size: 100, kind: 160 },
      },
      1,
    );
    expect(migrated).toEqual({
      explorerView: "details",
      explorerColumns: { size: 100, kind: 160 },
    });
  });

  beforeEach(() => {
    useWorkshopLayoutStore.setState({ previewOnClick: true });
    localStorage.clear();
  });

  describe("previewOnClick", () => {
    /* A walk through a directory stays one tab wide unless the user asks for
       a tab per file. */
    it("previews on a single click out of the box", () => {
      expect(useWorkshopLayoutStore.getInitialState().previewOnClick).toBe(true);
    });

    it("switches to a click that only selects", () => {
      useWorkshopLayoutStore.getState().setPreviewOnClick(false);
      expect(useWorkshopLayoutStore.getState().previewOnClick).toBe(false);
    });
  });

  describe("forwardLookingMeta", () => {
    /* The day a change lands is the day every mod that shipped the old shape
       stops working, so Problems says what is coming without being asked. */
    it("draws what a coming patch will break, out of the box", () => {
      expect(useWorkshopLayoutStore.getInitialState().forwardLookingMeta).toBe(true);
    });
  });
});

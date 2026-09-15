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
    useWorkshopLayoutStore.setState({ tabOpenMode: "append" });
    localStorage.clear();
  });

  describe("tabOpenMode", () => {
    /* Every open gets its own tab unless the user asks otherwise, so a walk
       through a directory leaves the files it opened behind. */
    it("appends by default", () => {
      expect(useWorkshopLayoutStore.getState().tabOpenMode).toBe("append");
    });

    it("switches to reusing one tab", () => {
      useWorkshopLayoutStore.getState().setTabOpenMode("replace");
      expect(useWorkshopLayoutStore.getState().tabOpenMode).toBe("replace");
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

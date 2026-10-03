// @vitest-environment happy-dom

import { TABLE_COLUMNS, useLibraryTableStore } from "..";

const KEY = "ltk-library-table";
const store = () => useLibraryTableStore.getState();

/**
 * A restart: the in-memory layout is gone and the store reads it back from disk.
 *
 * Resetting a persisted store writes the reset through to storage, so what was
 * saved is set aside first and put back for the store to read.
 */
async function restart() {
  const saved = localStorage.getItem(KEY);
  useLibraryTableStore.setState(useLibraryTableStore.getInitialState());
  if (saved !== null) localStorage.setItem(KEY, saved);
  await useLibraryTableStore.persist.rehydrate();
}

beforeEach(() => {
  localStorage.clear();
  useLibraryTableStore.setState(useLibraryTableStore.getInitialState());
});

describe("libraryTable store", () => {
  it("brings every layout setting back after a restart", async () => {
    const order = [...TABLE_COLUMNS].reverse();
    store().setColumnOrder(order);
    store().setColumnVisibility({ author: false, installed: true });
    store().setColumnSizing({ categories: 340, author: 90 });
    store().setDensity("compact");
    store().setGroupBy("tag");
    store().toggleGroupCollapsed("tag:map-skin");
    store().setDockWidth(512);
    store().setDockCollapsed(true);

    await restart();

    expect(store().columnOrder).toEqual(order);
    expect(store().columnVisibility).toEqual({ author: false, installed: true });
    expect(store().columnSizing).toEqual({ categories: 340, author: 90 });
    expect(store().density).toBe("compact");
    expect(store().groupBy).toBe("tag");
    expect(store().collapsedGroups).toEqual(new Set(["tag:map-skin"]));
    expect(store().dockWidth).toBe(512);
    expect(store().dockCollapsed).toBe(true);
  });

  it("adds a column the saved layout predates at the end of its order", async () => {
    const saved = TABLE_COLUMNS.filter((id) => id !== "license");
    localStorage.setItem(KEY, JSON.stringify({ state: { columnOrder: saved }, version: 1 }));

    await restart();

    expect(store().columnOrder).toEqual([...saved, "license"]);
  });

  it("drops a column the saved layout names but the table no longer draws", async () => {
    const saved = ["retired", ...TABLE_COLUMNS];
    localStorage.setItem(KEY, JSON.stringify({ state: { columnOrder: saved }, version: 1 }));

    await restart();

    expect(store().columnOrder).toEqual([...TABLE_COLUMNS]);
  });

  it("keeps the dock across a layout reset", async () => {
    store().setDockWidth(500);
    store().setDensity("comfortable");
    store().resetLayout();

    await restart();

    expect(store().density).toBe("default");
    expect(store().dockWidth).toBe(500);
  });
});

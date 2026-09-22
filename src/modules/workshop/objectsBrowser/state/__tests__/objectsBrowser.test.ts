import { afterEach, expect, it } from "vitest";

import { useObjectsBrowserStore } from "../objectsBrowser";

afterEach(() => useObjectsBrowserStore.setState(useObjectsBrowserStore.getInitialState(), true));

it("opens the selected tree folder at its own depth when switching to grid", () => {
  const store = useObjectsBrowserStore.getState();
  store.selectNode({ type: "prefix", id: "Characters/Annie/Skins" });
  store.setView("grid");
  expect(useObjectsBrowserStore.getState().display.location).toBe("Characters/Annie/Skins");
  expect(useObjectsBrowserStore.getState().reveal).toBeNull();
});

it("reveals the selected object in its parent grid and preserves a search", () => {
  const store = useObjectsBrowserStore.getState();
  store.setSearchPattern("Annie");
  store.selectNode({ type: "object", id: "Characters/Annie/Skins/Skin0" });
  store.setView("grid");
  expect(useObjectsBrowserStore.getState().display.location).toBe("Characters/Annie/Skins");
  expect(useObjectsBrowserStore.getState().reveal?.path).toBe("Characters/Annie/Skins/Skin0");
  expect(useObjectsBrowserStore.getState().searchPattern).toBe("Annie");
});

it("opens the unnamed group for a selected unnamed object", () => {
  const store = useObjectsBrowserStore.getState();
  store.selectNode({ type: "object", id: "0x12345678" });
  store.setView("grid");
  expect(useObjectsBrowserStore.getState().display.location).toBe("?");
});

it("starts with thumbnails enabled and keeps grid preferences through a reveal", () => {
  expect(useObjectsBrowserStore.getState().display.thumbnails).toBe(true);
  useObjectsBrowserStore
    .getState()
    .setDisplay({ view: "grid", tileSize: 160, location: "Characters" });
  useObjectsBrowserStore.getState().requestReveal("Characters/Annie/Skins/Skin0");
  expect(useObjectsBrowserStore.getState().display).toEqual({
    view: "grid",
    tileSize: 160,
    location: "Characters",
    thumbnails: true,
  });
});

it("gives repeated reveals distinct tokens after the previous request settles", () => {
  const store = useObjectsBrowserStore.getState();
  store.requestReveal("Characters/Annie");
  const first = useObjectsBrowserStore.getState().reveal!;
  store.settleReveal(first.token);
  store.requestReveal(first.path);
  expect(useObjectsBrowserStore.getState().reveal!.token).toBeGreaterThan(first.token);
});

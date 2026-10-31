import { describe, expect, it } from "vitest";

import { createPaneCommandHub, type PaneCommand, resolvePaneCommand } from "../paneCommands";

const runs: PaneCommand = { run: () => {} };
const idle: PaneCommand = { run: null, reason: "Pick a row" };

describe("resolvePaneCommand", () => {
  it("returns null if no source offers the command", () => {
    expect(resolvePaneCommand(new Map(), null, "delete")).toBeNull();
  });

  it("prefers the focused source even if its offer cannot run", () => {
    const published = new Map([
      ["graph", { delete: idle }],
      ["lanes", { delete: runs }],
    ]);

    expect(resolvePaneCommand(published, "graph", "delete")).toBe(idle);
  });

  it("prefers an offer that runs if the focused source makes no offer", () => {
    const published = new Map([
      ["graph", { delete: idle }],
      ["lanes", { delete: runs }],
      ["curve", {}],
    ]);

    expect(resolvePaneCommand(published, "curve", "delete")).toBe(runs);
  });

  it("returns an idle offer if nothing can run", () => {
    const published = new Map([["graph", { delete: idle }]]);

    expect(resolvePaneCommand(published, null, "delete")).toBe(idle);
  });
});

describe("createPaneCommandHub", () => {
  it("forgets the commands and the focus of a withdrawn source", () => {
    const hub = createPaneCommandHub();
    hub.publish("graph", { delete: idle });
    hub.publish("lanes", { delete: runs });
    hub.focus("graph");
    expect(hub.resolve("delete")).toBe(idle);

    hub.withdraw("graph");

    expect(hub.resolve("delete")).toBe(runs);
  });

  it("changes its version and calls listeners on each change", () => {
    const hub = createPaneCommandHub();
    let calls = 0;
    const unsubscribe = hub.subscribe(() => {
      calls += 1;
    });
    const before = hub.version();

    hub.publish("graph", { delete: runs });
    hub.focus("graph");
    hub.focus("graph");

    expect(calls).toBe(2);
    expect(hub.version()).not.toBe(before);

    unsubscribe();
    hub.withdraw("graph");
    expect(calls).toBe(2);
  });
});

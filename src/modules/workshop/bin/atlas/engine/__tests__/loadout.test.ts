import { describe, expect, it } from "vitest";

import type { UiLoadout, UiTexture } from "@/lib/tauri";

import { NO_OVERLAY } from "../model/combo";
import { roleHidden, roleTexts, withLoadout, withRoles } from "../model/loadout";
import { buildTree } from "../model/tree";
import type { View, ViewLook } from "../model/view";
import { restingHiddenScenes } from "../model/visibility";
import { element, icon, scene, view } from "./fixtures";

function texture(path: string): UiTexture {
  return { path, asset: { kind: "file", path }, page: false };
}

const LOADOUT: UiLoadout = {
  champion: "Ahri",
  nameKey: null,
  portrait: texture("square.tex"),
  splash: null,
  abilities: [texture("q.dds"), texture("w.dds"), null, null],
  passive: null,
  summoners: [texture("flash.dds"), null],
  keystone: null,
  substyle: null,
  items: [],
};

function blank(): ViewLook {
  const look = icon();
  if (look.kind !== "icon") throw new Error("an icon");
  return { ...look, sprite: null };
}

function bound(): View {
  return {
    ...view(
      [scene("s", 0)],
      [
        element("ability", "s", 0, blank()),
        element("portrait", "s", 1, icon()),
        element("summoner", "s", 2, blank()),
        element("hotkey", "s", 3, blank()),
        element("idle", "s", 4, blank()),
        element("oom", "s", 5, icon()),
        { ...element("augment", "s", 6, icon()), path: "Frame/Ability0/Augment" },
        { ...element("frameFx", "s", 7, icon()), path: "Frame/Ability0/Augment/Border/FrameFX" },
        { ...element("augmentless", "s", 8, icon()), path: "Frame/Ability0/AugmentIcon" },
      ],
    ),
    bindings: [
      { element: "ability", role: { kind: "ability", slot: 1 } },
      { element: "portrait", role: { kind: "portrait" } },
      { element: "summoner", role: { kind: "summoner", slot: 1 } },
      { element: "hotkey", role: { kind: "hotkey", key: "W" } },
      { element: "idle", role: { kind: "idle" } },
      { element: "oom", role: { kind: "hidden" } },
      { element: "augment", role: { kind: "hidden" } },
    ],
  };
}

function spriteOf(filled: View, key: string) {
  const look = filled.elements.find((each) => each.key === key)?.look;
  return look?.kind === "icon" ? look.sprite : undefined;
}

describe("withLoadout", () => {
  it("fills a bound icon the file leaves blank with the loadout's texture, whole", () => {
    const filled = withLoadout(bound(), LOADOUT);
    const sprite = spriteOf(filled, "ability");

    expect(sprite?.uv).toEqual([0, 0, 1, 1]);
    expect(filled.textures[sprite?.texture ?? -1]?.path).toBe("w.dds");
  });

  it("keeps a sprite the file draws, and a slot the loadout has nothing for", () => {
    const original = bound();
    const filled = withLoadout(original, LOADOUT);

    expect(spriteOf(filled, "portrait")).toEqual(spriteOf(original, "portrait"));
    expect(spriteOf(filled, "summoner")).toBeNull();
  });

  it("draws the view as it stands without a loadout", () => {
    const original = bound();

    expect(withLoadout(original, null)).toBe(original);
  });
});

describe("roleTexts", () => {
  it("reads a hotkey's key and leaves an idle text empty", () => {
    const texts = roleTexts(bound());

    expect(texts.get("hotkey")).toBe("W");
    expect(texts.get("idle")).toBe("");
    expect(texts.has("ability")).toBe(false);
  });

  it("gives way to a text the overlay sets itself", () => {
    const overlay = { ...NO_OVERLAY, texts: new Map([["hotkey", "combo"]]) };

    const merged = withRoles(overlay, roleTexts(bound()), roleHidden(bound()));

    expect(merged.texts.get("hotkey")).toBe("combo");
    expect(merged.texts.get("idle")).toBe("");
    expect([...merged.hidden]).toEqual(["oom", "augment", "frameFx"]);
  });
});

describe("restingHiddenScenes", () => {
  it("shows the scenes a controller's moment switches on and hides the ones it switches off", () => {
    const scoreboard = {
      ...view(
        [
          { ...scene("Scoreboard", 0), enabled: false },
          { ...scene("SB_T1P0", 0, "Scoreboard"), enabled: true },
          { ...scene("SocialCard", 0), enabled: false },
        ],
        [],
      ),
      class: "ScoreboardViewController",
    };
    const target = {
      ...view([scene("TargetFrame", 0), scene("TargetFrameClosed", 0)], []),
      class: "TargetFrameViewController",
    };

    expect([...restingHiddenScenes(buildTree(scoreboard))]).toEqual(["SocialCard"]);
    expect([...restingHiddenScenes(buildTree(target))]).toEqual(["TargetFrameClosed"]);
  });
});

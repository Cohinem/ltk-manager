import { describe, expect, it } from "vitest";

import type { FixPreview, SkinAudioRepair } from "@/lib/tauri";

import { previewNote } from "../previewNote";

function skinAudio(over: Partial<SkinAudioRepair> = {}): FixPreview {
  return {
    facts: {
      kind: "skinAudio",
      removedUnits: [],
      removedTags: [],
      addedUnits: [],
      renamedEvents: 0,
      silentClipEvents: 0,
      silentVfxEvents: 0,
      ...over,
    },
    before: "Lux, LuxSkin07",
    after: "Lux",
  };
}

describe("previewNote", () => {
  it("returns the note of the preview if it has no facts", () => {
    expect(previewNote({ note: "3 items", before: null, after: null })).toBe("3 items");
  });

  it("returns null if the preview has neither a note nor facts", () => {
    expect(previewNote({ before: "0", after: "0x1" })).toBeNull();
  });

  it("words a removed unit and a removed tag with a silent clip event", () => {
    const fix = skinAudio({
      removedUnits: ["Lux_Skin07_SFX"],
      removedTags: ["LuxSkin07"],
      silentClipEvents: 1,
    });

    expect(previewNote(fix)).toBe(
      "Removes the bank unit Lux_Skin07_SFX and the tag LuxSkin07. 1 clip event plays nothing.",
    );
  });

  it("words the removed units alone if no tag is removed", () => {
    const fix = skinAudio({ removedUnits: ["Ahri_Skin07_SFX", "Ahri_Skin08_SFX"] });

    expect(previewNote(fix)).toBe("Removes the bank units Ahri_Skin07_SFX, Ahri_Skin08_SFX.");
  });

  it("words the removed tags alone if no unit is removed", () => {
    expect(previewNote(skinAudio({ removedTags: ["AhriSkin07"] }))).toBe(
      "Removes the tag AhriSkin07.",
    );
  });

  it("words the added units and the renamed events in the singular", () => {
    const fix = skinAudio({
      removedUnits: ["Ahri_Skin07_SFX"],
      removedTags: ["AhriSkin07"],
      addedUnits: ["Ahri_Base_SFX"],
      renamedEvents: 1,
    });

    expect(previewNote(fix)).toBe(
      "Removes the bank unit Ahri_Skin07_SFX and the tag AhriSkin07. Adds the bank unit Ahri_Base_SFX. Renames 1 event to its base event.",
    );
  });

  it("words the renamed and the silent events in the plural", () => {
    const fix = skinAudio({
      removedUnits: ["Ahri_Skin07_SFX", "Ahri_Skin08_SFX"],
      removedTags: ["AhriSkin07", "AhriSkin08"],
      renamedEvents: 3,
      silentClipEvents: 2,
      silentVfxEvents: 4,
    });

    expect(previewNote(fix)).toBe(
      "Removes the bank units Ahri_Skin07_SFX, Ahri_Skin08_SFX and the tags AhriSkin07, AhriSkin08. Renames 3 events to their base events. 2 clip events play nothing. 4 VFX events play nothing.",
    );
  });
});

import { describe, expect, it } from "vitest";

import type { MediaRow, SetFile } from "@/lib/tauri";

import { matchingMedia, mediaCandidates } from "../mediaPicker";

function file(path: string): SetFile {
  return {
    path,
    asset: { kind: "file", path: `C:/mods/${path}` },
    state: { kind: "found" },
    opened: false,
  };
}

function row(sourceId: number): MediaRow {
  return { sourceId, sizeBytes: 100, format: null, playback: { kind: "playable" } };
}

const BANK = file("assets/sounds/ahri_skin07_sfx_audio.bnk");
const PACKAGE = file("assets/sounds/ahri_skin07_vo_audio.wpk");

const SET = [
  { file: BANK, media: [row(11), row(12)] },
  { file: PACKAGE, media: [row(21), row(12)] },
];

describe("mediaCandidates", () => {
  it("offers a sound of a bank's media index the media of the banks of the set", () => {
    const candidates = mediaCandidates(SET, "dataBank");

    expect(candidates.map((each) => [each.name, each.media.source, each.media.container])).toEqual([
      ["ahri_skin07_sfx_audio.bnk", 11, "bank"],
      ["ahri_skin07_sfx_audio.bnk", 12, "bank"],
    ]);
  });

  it("offers a streamed sound the media of the packages of the set", () => {
    const candidates = mediaCandidates(SET, "streaming");

    expect(candidates.map((each) => [each.media.source, each.media.container])).toEqual([
      [21, "package"],
      [12, "package"],
    ]);
  });

  it("offers a prefetched sound nothing, as its media is in two files", () => {
    expect(mediaCandidates(SET, "prefetch")).toEqual([]);
  });

  it("lists a source ID once, from the first file that holds it", () => {
    const twice = [
      { file: BANK, media: [row(11)] },
      { file: file("assets/sounds/ahri_base_sfx_audio.bnk"), media: [row(11)] },
    ];

    expect(mediaCandidates(twice, "dataBank").map((each) => each.name)).toEqual([
      "ahri_skin07_sfx_audio.bnk",
    ]);
  });
});

describe("matchingMedia", () => {
  const candidates = mediaCandidates(SET, "dataBank");

  it("keeps the media whose source ID or file name contains the query, without the current one", () => {
    expect(matchingMedia(candidates, "#1", 11).map((each) => each.media.source)).toEqual([12]);
    expect(matchingMedia(candidates, "SFX", 12).map((each) => each.media.source)).toEqual([11]);
  });

  it("keeps none for a query that matches no ID and no name", () => {
    expect(matchingMedia(candidates, "vo_audio", 0)).toEqual([]);
  });
});

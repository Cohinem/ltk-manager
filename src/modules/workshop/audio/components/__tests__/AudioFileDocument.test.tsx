// @vitest-environment happy-dom

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AssetInfo, AssetRef, MediaRow } from "@/lib/tauri";
import { commandNames } from "@/test/commandNames";
import { mockInvoke } from "@/test/mocks/tauri";
import { renderWithProviders } from "@/test/utils";

import { playedUrls } from "../../player/__tests__/fakeChannel";
import { AudioFileDocument } from "../AudioFileDocument";

vi.mock("../../player/soundPlayer", async () => {
  const fake = await import("../../player/__tests__/fakeChannel");
  return {
    openChannel: fake.openFakeChannel,
    decodeMedia: fake.decodeFakeMedia,
    decodeUncachedMedia: fake.decodeFakeMedia,
  };
});

vi.mock("@tanstack/react-virtual", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-virtual")>();
  return {
    ...actual,
    useVirtualizer: (
      options: Parameters<typeof actual.useVirtualizer<HTMLDivElement, HTMLDivElement>>[0],
    ) =>
      actual.useVirtualizer({
        ...options,
        observeElementRect: (_instance, callback) => {
          callback({ width: 800, height: 600 });
        },
        measureElement: () => 27,
      }),
  };
});

const ASSET: AssetRef = { kind: "file", path: "C:/mods/ahri_base_vo_audio.wpk" };

const VORBIS = 0xffff;

function row(sourceId: number, over: Partial<MediaRow> = {}): MediaRow {
  return {
    sourceId,
    sizeBytes: 2048,
    format: {
      codec: VORBIS,
      channels: 1,
      sampleRate: 48000,
      averageBytesPerSecond: 8000,
      dataSize: 16000,
      durationSeconds: 2,
    },
    playback: { kind: "playable" },
    ...over,
  };
}

const PACKAGE_INFO: AssetInfo = {
  kind: "audio",
  container: "package",
  sizeBytes: 6144,
  mediaCount: 3,
  bank: null,
  failure: null,
};

const world: { info: AssetInfo; rows: MediaRow[] } = { info: PACKAGE_INFO, rows: [] };

function answer(command: string): unknown {
  switch (command) {
    case commandNames.preview.readAssetInfo:
      return world.info;
    case commandNames.audio.readAudioMedia:
      return world.rows;
    case commandNames.audio.readAudioEvents:
      return { list: { events: [], files: [], origin: "units" }, index: { status: "ready" } };
    case commandNames.audio.readBankReferences:
      return { path: "ahri_base_vo_audio.wpk", units: [], lists: [], index: { status: "ready" } };
    default:
      return null;
  }
}

describe("AudioFileDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    world.info = PACKAGE_INFO;
    world.rows = [row(10322914), row(10583207), row(11094382)];
    mockInvoke.mockImplementation((command: string) =>
      Promise.resolve({ ok: true, value: answer(command) }),
    );
    playedUrls.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("plays the selected row on Space", async () => {
    renderWithProviders(<AudioFileDocument asset={ASSET} name="ahri_base_vo_audio.wpk" />);

    const table = await screen.findByRole("grid");
    await screen.findByText("10322914");
    fireEvent.focus(table);
    fireEvent.keyDown(table, { key: "ArrowDown" });
    fireEvent.keyDown(table, { key: " " });

    await waitFor(() => expect(playedUrls).toHaveLength(1));
    expect(playedUrls[0]).toContain("source=10583207");
    expect(screen.getByRole("button", { name: "Stop 10583207" })).toBeInTheDocument();
  });

  it("stops the first row when a second row plays", async () => {
    renderWithProviders(<AudioFileDocument asset={ASSET} name="ahri_base_vo_audio.wpk" />);

    fireEvent.click(await screen.findByRole("button", { name: "Play 10322914" }));
    fireEvent.click(screen.getByRole("button", { name: "Play 11094382" }));

    await waitFor(() => expect(playedUrls).toHaveLength(2));
    expect(playedUrls[1]).toContain("source=11094382");
    expect(screen.getByRole("button", { name: "Play 10322914" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Stop / })).toHaveLength(1);
  });

  it("disables the play button of a media that cannot be decoded", async () => {
    world.rows = [
      row(5, {
        format: { ...row(5).format!, codec: 0x3040 },
        playback: { kind: "unsupportedCodec" },
      }),
    ];
    renderWithProviders(<AudioFileDocument asset={ASSET} name="ahri_base_vo_audio.wpk" />);

    expect(await screen.findByRole("button", { name: "Play 5" })).toBeDisabled();
    expect(screen.getByText("Opus")).toBeInTheDocument();
  });

  it("shows the rejection of a bank as a warning", async () => {
    world.info = {
      kind: "audio",
      container: "bank",
      sizeBytes: 452,
      mediaCount: 0,
      bank: {
        version: 134,
        bankType: 0,
        alignment: 0,
        headerId: 1,
        nameId: 1,
        rejection: "legacy bank version 134 has a HIRC chunk",
        eventCount: 4,
      },
      failure: null,
    };
    world.rows = [];
    renderWithProviders(<AudioFileDocument asset={ASSET} name="map22_events.bnk" />);

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/legacy bank version 134 has a HIRC chunk/)).toBeInTheDocument();
  });

  it("narrows the rows to the source IDs that contain the filter", async () => {
    renderWithProviders(<AudioFileDocument asset={ASSET} name="ahri_base_vo_audio.wpk" />);
    await screen.findByText("10322914");

    fireEvent.change(screen.getByRole("textbox", { name: "Filter source ID" }), {
      target: { value: "105" },
    });

    await waitFor(() => expect(screen.queryByText("10322914")).not.toBeInTheDocument());
    expect(screen.getByText("10583207")).toBeInTheDocument();
    expect(screen.queryByText("11094382")).not.toBeInTheDocument();
  });
});

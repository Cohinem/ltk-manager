// @vitest-environment happy-dom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AssetRef, AudioEventsResponse, EventTree, MediaLocation } from "@/lib/tauri";
import { commandNames } from "@/test/commandNames";
import { mockInvoke } from "@/test/mocks/tauri";
import { renderWithProviders } from "@/test/utils";

import { EventsPanel } from "../EventsPanel";

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

const ASSET: AssetRef = { kind: "file", path: "C:/mods/ahri_skin07_sfx_events.bnk" };

const NAMED = 100;
const SILENT = 200;

function media(source: number): MediaLocation {
  return {
    asset: { kind: "file", path: "C:/mods/ahri_skin07_sfx_audio.bnk" },
    path: "assets/sounds/ahri_skin07_sfx_audio.bnk",
    source,
    container: "bank",
  };
}

const EVENTS: AudioEventsResponse = {
  list: {
    events: [
      {
        id: SILENT,
        name: null,
        actionCount: 1,
        mediaCount: 1,
        status: { kind: "mediaMissing" },
      },
      {
        id: NAMED,
        name: "Play_sfx_Ahri_AhriQ_OnCast",
        actionCount: 1,
        mediaCount: 2,
        status: { kind: "resolved" },
      },
    ],
    files: [],
    origin: "units",
  },
  index: { status: "ready" },
};

const TREE: EventTree = {
  event: NAMED,
  name: "Play_sfx_Ahri_AhriQ_OnCast",
  actions: [
    {
      id: 5,
      class: 0x0400,
      label: "Play",
      target: 7,
      node: {
        kind: "random",
        id: 7,
        children: [
          { kind: "sound", id: 1, source: 13004521, stream: "dataBank", media: media(13004521) },
          { kind: "sound", id: 2, source: 13004522, stream: "dataBank", media: media(13004522) },
        ],
      },
    },
  ],
};

function answer(command: string): unknown {
  switch (command) {
    case commandNames.audio.readAudioEvents:
      return EVENTS;
    case commandNames.audio.readAudioEvent:
      return TREE;
    default:
      return null;
  }
}

/** Returns a source that answers `values` in turn. */
function seeded(values: number[]): () => number {
  let at = 0;
  return () => values[at++ % values.length] ?? 0;
}

const played: string[] = [];

describe("EventsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    played.length = 0;
    mockInvoke.mockImplementation((command: string) =>
      Promise.resolve({ ok: true, value: answer(command) }),
    );
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(
      function (this: HTMLMediaElement) {
        played.push(this.src);
        return Promise.resolve();
      },
    );
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("expands the selected event on ArrowRight", async () => {
    renderWithProviders(<EventsPanel asset={ASSET} />);

    const tree = await screen.findByRole("tree");
    fireEvent.focus(tree);
    fireEvent.keyDown(tree, { key: "ArrowRight" });

    expect(await screen.findByText("Play")).toBeInTheDocument();
    expect(screen.queryByText("Random #7")).not.toBeInTheDocument();

    fireEvent.keyDown(tree, { key: "ArrowRight" });
    fireEvent.keyDown(tree, { key: "ArrowRight" });

    expect(await screen.findByText("Random #7")).toBeInTheDocument();
  });

  it("plays one child of a random container per press of Space", async () => {
    renderWithProviders(<EventsPanel asset={ASSET} random={seeded([0, 0.99])} />);

    const tree = await screen.findByRole("tree");
    fireEvent.focus(tree);
    fireEvent.keyDown(tree, { key: " " });
    await waitFor(() => expect(played).toHaveLength(1));
    fireEvent.keyDown(tree, { key: " " });
    await waitFor(() => expect(played).toHaveLength(2));

    expect(played[0]).toContain("source=13004521");
    expect(played[1]).toContain("source=13004522");
  });

  it("marks an event whose media no file holds", async () => {
    renderWithProviders(<EventsPanel asset={ASSET} />);

    expect(await screen.findByText(`#${SILENT}`)).toBeInTheDocument();
    expect(screen.getByText("Media missing")).toBeInTheDocument();
  });
});

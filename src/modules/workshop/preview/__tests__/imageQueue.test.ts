import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IMAGE_SLOTS, type ImageLane, ImageQueue, PREVIEW_SLOTS, SETTLE_MS } from "../imageQueue";

const TILE_SLOTS = IMAGE_SLOTS - PREVIEW_SLOTS;

function asker(queue: ImageQueue) {
  const started: string[] = [];
  const ask = (name: string, lane: ImageLane = "tile", archive: string | null = null) =>
    queue.ask({ lane, archive, start: () => started.push(name) });
  return { started, ask };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ImageQueue", () => {
  it("starts a tile at once while the scroll is still", () => {
    const queue = new ImageQueue();
    const { started, ask } = asker(queue);

    ask("swatch");

    expect(started).toEqual(["swatch"]);
  });

  it("holds the tiles while the scroll moves, and starts them once it has been still for the settle", () => {
    const queue = new ImageQueue();
    const { started, ask } = asker(queue);

    queue.stir();
    ask("swatch");
    vi.advanceTimersByTime(SETTLE_MS - 10);
    queue.stir();
    vi.advanceTimersByTime(SETTLE_MS - 1);
    expect(started).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(started).toEqual(["swatch"]);
  });

  it("holds six in flight and one of them for the preview tab", () => {
    const queue = new ImageQueue();
    const { started, ask } = asker(queue);

    for (let at = 0; at < IMAGE_SLOTS + 2; at += 1) ask(`tile${at}`);
    expect(started).toHaveLength(TILE_SLOTS);

    ask("preview", "preview");
    expect(started).toContain("preview");
    expect(started).toHaveLength(IMAGE_SLOTS);

    ask("second preview", "preview");
    expect(started).not.toContain("second preview");
  });

  it("starts the preview tab's ask through a moving scroll", () => {
    const queue = new ImageQueue();
    const { started, ask } = asker(queue);

    queue.stir();
    ask("preview", "preview");

    expect(started).toEqual(["preview"]);
  });

  it("hands a freed slot to the preview before any tile", () => {
    const queue = new ImageQueue();
    const { started, ask } = asker(queue);

    for (let at = 0; at < IMAGE_SLOTS; at += 1) ask(`preview${at}`, "preview");
    ask("late tile");
    ask("late preview", "preview");
    expect(started).toHaveLength(IMAGE_SLOTS);

    queue.release(1);
    expect(started.at(-1)).toBe("late preview");

    /* Five previews hold the five slots a tile may take. */
    queue.release(2);
    expect(started.at(-1)).toBe("late preview");

    queue.release(3);
    expect(started.at(-1)).toBe("late tile");
  });

  it("orders the tiles by archive, and by arrival within one", () => {
    const queue = new ImageQueue();
    const { started, ask } = asker(queue);

    queue.stir();
    ask("ui", "tile", "UI.wad.client");
    ask("aatrox first", "tile", "Champions/Aatrox.wad.client");
    ask("layer", "tile", null);
    ask("aatrox second", "tile", "Champions/Aatrox.wad.client");
    vi.advanceTimersByTime(SETTLE_MS);

    expect(started).toEqual(["layer", "aatrox first", "aatrox second", "ui"]);
  });

  it("drops an ask released before it starts, and frees the slot of one released in flight", () => {
    const queue = new ImageQueue();
    const { started, ask } = asker(queue);

    queue.stir();
    const gone = ask("gone");
    queue.release(gone);
    vi.advanceTimersByTime(SETTLE_MS);
    expect(started).toEqual([]);

    const tickets = Array.from({ length: TILE_SLOTS + 1 }, (_, at) => ask(`tile${at}`));
    expect(started).toHaveLength(TILE_SLOTS);

    queue.release(tickets[0]!);
    expect(started).toContain(`tile${TILE_SLOTS}`);

    queue.release(tickets[0]!);
    ask("after a double release");
    expect(started).not.toContain("after a double release");
  });
});

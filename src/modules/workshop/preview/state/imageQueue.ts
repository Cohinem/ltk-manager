/**
 * The line previews wait in for the `ltk-asset` host, per "Thumbnails" in
 * docs/ux/PROJECT_EDITOR.md.
 *
 * The webview caps itself at six connections to one host and takes them in mount
 * order, which puts the open preview behind a screen of tiles. The line decides
 * which six instead.
 */

/** Connections the webview opens to one host at once. */
export const IMAGE_SLOTS = 6;

/** Slots held back from the tiles for what a preview tab asks for. */
export const PREVIEW_SLOTS = 1;

/** The stillness of the scroll a tile's ask waits for, the project bar's debounce. */
export const SETTLE_MS = 120;

/** Who is asking: the open preview tab, or a tile, a swatch or a card at its size. */
export type ImageLane = "preview" | "tile";

export interface ImageAsk {
  readonly lane: ImageLane;
  /** The archive the bytes come from, and null for a layer file or a loose file. */
  readonly archive: string | null;
  /** The slot is the asker's. */
  readonly start: () => void;
}

/** One ask, handed back to release it. */
export type ImageTicket = number;

interface Entry extends ImageAsk {
  readonly ticket: ImageTicket;
}

export class ImageQueue {
  #waiting: Entry[] = [];
  #inFlight = new Set<ImageTicket>();
  #settle: ReturnType<typeof setTimeout> | null = null;
  #next: ImageTicket = 1;

  /** Ask for a slot. `start` runs the moment it is granted, on this call where one is free. */
  ask(request: ImageAsk): ImageTicket {
    const ticket = this.#next;
    this.#next += 1;
    this.#waiting.push({ ...request, ticket });
    this.#pump();
    return ticket;
  }

  /** The scroll moved. The tiles hold their asks for `SETTLE_MS` of stillness. */
  stir(): void {
    if (this.#settle !== null) clearTimeout(this.#settle);
    this.#settle = setTimeout(() => {
      this.#settle = null;
      this.#pump();
    }, SETTLE_MS);
  }

  /**
   * The image landed or failed, or its asker is gone.
   *
   * An ask in flight frees its slot and one in the line leaves it. A ticket
   * released twice is released once.
   */
  release(ticket: ImageTicket): void {
    if (this.#inFlight.delete(ticket)) {
      this.#pump();
      return;
    }
    const at = this.#waiting.findIndex((entry) => entry.ticket === ticket);
    if (at >= 0) this.#waiting.splice(at, 1);
  }

  #pump(): void {
    for (;;) {
      const next = this.#first();
      if (!next) return;
      const cap = next.lane === "preview" ? IMAGE_SLOTS : IMAGE_SLOTS - PREVIEW_SLOTS;
      if (this.#inFlight.size >= cap) return;
      if (next.lane === "tile" && this.#settle !== null) return;
      this.#waiting.splice(this.#waiting.indexOf(next), 1);
      this.#inFlight.add(next.ticket);
      next.start();
    }
  }

  /** The preview's ask first, then the tiles by archive, and the earlier ask within one. */
  #first(): Entry | undefined {
    let best: Entry | undefined;
    for (const entry of this.#waiting) {
      if (!best || before(entry, best)) best = entry;
    }
    return best;
  }
}

/* By archive. One mount of the cache serves a run of tiles. A layer file mounts
   nothing and goes first. */
function before(a: Entry, b: Entry): boolean {
  if (a.lane !== b.lane) return a.lane === "preview";
  const archiveA = a.archive ?? "";
  const archiveB = b.archive ?? "";
  if (archiveA !== archiveB) return archiveA < archiveB;
  return a.ticket < b.ticket;
}

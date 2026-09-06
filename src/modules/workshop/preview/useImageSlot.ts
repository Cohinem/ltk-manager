import { useCallback, useEffect, useRef, useState } from "react";

import { type ImageAsk, ImageQueue, type ImageTicket } from "./imageQueue";

/** The one line every preview in the app waits in. */
const queue = new ImageQueue();

/** A scroll moved under the tiles. The scroll container of a tree calls this on scroll. */
export function stirImages(): void {
  queue.stir();
}

export interface ImageSlot {
  /** The URL the line's grant carries. Undefined without one. */
  readonly src: string | undefined;
  /** The `<img>` landed or failed, and the slot goes back. */
  readonly onSettled: () => void;
}

/**
 * A place in the line for one `<img>`.
 *
 * The `<img>` takes `src` and reports back through `onSettled`. An unmount with
 * the ask outstanding releases it, which drops the fetch with the element.
 */
export function useImageSlot(url: string, { lane, archive }: Omit<ImageAsk, "start">): ImageSlot {
  const [granted, setGranted] = useState<string | null>(null);
  const ticket = useRef<ImageTicket | null>(null);

  useEffect(() => {
    const own = queue.ask({ lane, archive, start: () => setGranted(url) });
    ticket.current = own;
    return () => {
      queue.release(own);
      if (ticket.current === own) ticket.current = null;
    };
  }, [url, lane, archive]);

  const onSettled = useCallback(() => {
    if (ticket.current === null) return;
    queue.release(ticket.current);
    ticket.current = null;
  }, []);

  return { src: granted === url ? url : undefined, onSettled };
}

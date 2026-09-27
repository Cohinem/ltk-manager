import type { ReactNode, RefObject } from "react";

/** One preview's box on the page and what its canvas draws in it. */
export interface PreviewEntry {
  readonly id: string;
  readonly box: RefObject<HTMLElement | null>;
  readonly children: ReactNode;
}

/**
 * The previews of one Graph pane, which the nodes register and the pane's canvas draws.
 *
 * A pane of its own keeps a second pane's canvas from drawing this one's nodes.
 */
export class PreviewViewStore {
  private views: readonly PreviewEntry[] = [];
  private readonly listeners = new Set<() => void>();

  set(entry: PreviewEntry): void {
    const at = this.views.findIndex((each) => each.id === entry.id);
    this.views =
      at < 0
        ? [...this.views, entry]
        : this.views.map((each, index) => (index === at ? entry : each));
    this.emit();
  }

  delete(id: string): void {
    if (!this.views.some((each) => each.id === id)) return;

    this.views = this.views.filter((each) => each.id !== id);
    this.emit();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  snapshot = (): readonly PreviewEntry[] => this.views;

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

/** A rectangle as `getBoundingClientRect` gives one, in page pixels. */
interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Where a view draws on its canvas, in the canvas's pixels from its bottom left. */
export interface ViewPlace {
  readonly left: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Where the preview box `view` draws on `canvas`, and null for one with no area on it.
 *
 * Both are measured on the frame they are used, so a box never draws against a size or a
 * place the canvas had before.
 */
export function viewPlace(view: Rect, canvas: Rect): ViewPlace | null {
  const outside =
    view.width <= 0 ||
    view.height <= 0 ||
    view.left + view.width <= canvas.left ||
    view.left >= canvas.left + canvas.width ||
    view.top + view.height <= canvas.top ||
    view.top >= canvas.top + canvas.height;
  if (outside) return null;

  return {
    left: view.left - canvas.left,
    bottom: canvas.top + canvas.height - (view.top + view.height),
    width: view.width,
    height: view.height,
  };
}

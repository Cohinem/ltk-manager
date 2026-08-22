import { WarningIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

import { Button, Popover } from "@/components";

import { useDeleteLayerContent } from "../api";

/** The row a delete is aimed at, flattened out of the tree node that opened it. */
export interface DeleteContentTarget {
  /** Layer-relative, which is what the command addresses. */
  relativePath: string;
  /** The row's own label. A folded directory row names its whole run. */
  name: string;
  isDir: boolean;
  /** Files below a directory row. Zero for a file row, which is itself the one. */
  fileCount: number;
}

/**
 * The row the confirmation points at, looked up rather than held.
 *
 * The tree is virtualized and a pinned row has a second copy of itself, so the
 * element standing for a node is the tree's to answer for, and the answer can
 * change while the popover is open.
 */
export type ContentRowAnchor = () => HTMLElement | null;

interface DeleteContentPopoverProps {
  target: DeleteContentTarget | null;
  anchor: ContentRowAnchor;
  projectPath: string;
  layerName: string;
  onClose: () => void;
}

/**
 * The confirmation a delete out of a layer goes through, on the row itself.
 *
 * Every delete is confirmed rather than only the ones that look expensive: the
 * file a row names is often the only copy of an edit, and nothing here reaches
 * the recycle bin. What the popover varies is how much it says is going, so the
 * cost of a folder row is on screen before the button is.
 */
export function DeleteContentPopover({
  target,
  anchor,
  projectPath,
  layerName,
  onClose,
}: DeleteContentPopoverProps) {
  const deleteContent = useDeleteLayerContent();

  function handleConfirm() {
    if (!target) return;
    deleteContent.mutate(
      { projectPath, layerName, relativePath: target.relativePath, name: target.name },
      { onSuccess: onClose },
    );
  }

  if (!target) return null;

  const subject = target.isDir ? "folder" : "file";
  const [keeps, goes] = splitPath(target);

  return (
    <Popover.Root open modal onOpenChange={(open) => !open && onClose()}>
      <Popover.Portal>
        <Popover.Backdrop className="bg-transparent transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
          <Spotlight anchor={anchor} />
        </Popover.Backdrop>

        <Popover.Positioner anchor={anchor} sideOffset={8} collisionPadding={12}>
          <Popover.Popup className="w-80">
            <Popover.Arrow />

            <div className="flex flex-col gap-3 p-3">
              <p className="rounded-md border border-surface-600 bg-surface-950/40 px-2.5 py-2 font-mono text-[0.6875rem] leading-relaxed break-all text-surface-500">
                {keeps}
                <span className="text-surface-100">{goes}</span>
              </p>

              <div className="flex items-start gap-2.5">
                <WarningIcon className="mt-px h-4 w-4 shrink-0 text-danger-text" />
                <div className="flex min-w-0 flex-col gap-1">
                  <Popover.Title className="font-medium text-danger-text">
                    {describeLoss(target)}
                  </Popover.Title>
                  <Popover.Description className="text-xs">
                    Deleted files do not go to the Recycle Bin.
                  </Popover.Description>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={handleConfirm}
                  loading={deleteContent.isPending}
                >
                  Delete {subject}
                </Button>
              </div>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * The scrim, with the anchored row cut out of it.
 *
 * Four strips around the row rather than one sheet over everything: a
 * confirmation that points at a row and then blurs that row away has argued
 * against itself. What the popover claims it is deleting stays legible next to
 * it, and the ring is what keeps the gap in the dim from reading as a seam.
 */
function Spotlight({ anchor }: { anchor: ContentRowAnchor }) {
  const rect = useAnchorRect(anchor);
  const dim = "absolute bg-scrim backdrop-blur-sm";

  if (!rect) return <div className={twMerge(dim, "inset-0")} />;

  return (
    <>
      <div className={twMerge(dim, "inset-x-0 top-0")} style={{ height: rect.top }} />
      <div className={twMerge(dim, "inset-x-0 bottom-0")} style={{ top: rect.bottom }} />
      <div
        className={twMerge(dim, "left-0")}
        style={{ top: rect.top, height: rect.height, width: rect.left }}
      />
      <div
        className={twMerge(dim, "right-0")}
        style={{ top: rect.top, height: rect.height, left: rect.right }}
      />
      <div
        className="absolute rounded-sm ring-1 ring-accent-500/50"
        style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
      />
    </>
  );
}

/** The anchored row's box, remeasured when the window moves under it. */
function useAnchorRect(anchor: ContentRowAnchor): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(() => anchor()?.getBoundingClientRect() ?? null);

  /* A modal popover locks the page scroll, so a resize is the only thing left
     that can move the row after this opens. */
  useEffect(() => {
    const measure = () => setRect(anchor()?.getBoundingClientRect() ?? null);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [anchor]);

  return rect;
}

/**
 * The path, cut where the delete starts: what survives, then what goes.
 *
 * A folded row's name is the whole run of directories it stands for, and the
 * delete prunes every directory it empties, so the run is what disappears. The
 * cut lands in the same place for a plain row, whose name is one segment.
 */
function splitPath({ relativePath, name }: DeleteContentTarget): [string, string] {
  if (!relativePath.endsWith(name)) return ["", relativePath];
  return [relativePath.slice(0, relativePath.length - name.length), name];
}

/**
 * What goes, counted, so a folder row says its size before it is confirmed.
 *
 * A folded row stands for a run of directories rather than one, and the whole
 * run goes with it, so the plural is not cosmetic.
 */
function describeLoss({ isDir, name, fileCount }: DeleteContentTarget): string {
  if (!isDir) return "This permanently removes the file";

  const folded = name.includes("/");
  const folders = folded ? "the folders" : "the folder";
  const within = folded ? "in them" : "in it";

  if (fileCount === 0) return `This permanently removes ${folders}`;
  if (fileCount === 1) return `This permanently removes ${folders} and the file ${within}`;
  return `This permanently removes ${folders} and the ${fileCount} files ${within}`;
}

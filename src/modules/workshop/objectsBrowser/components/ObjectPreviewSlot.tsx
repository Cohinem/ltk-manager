import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { ErrorBoundary, Popover } from "@/components";
import { m } from "@/i18n";

import { objectPreviewKey } from "../utils/objectPreview";
import type { ObjectRowNode } from "../utils/objectTree";

const ObjectPreviewWorker = lazy(() => import("./ObjectPreviewWorker"));
const JOB_TIMEOUT_MS = 15_000;

/** One bounded renderer slot, docked for stills or displayed in an anchored hover preview. */
export function ObjectPreviewSlot({
  node,
  revision,
  onImage,
  scroll,
  targetIndex,
  onEnter,
  onLeave,
  onClose,
}: {
  onEnter: () => void;
  onLeave: () => void;
  onClose: () => void;
  scroll: RefObject<HTMLDivElement | null>;
  targetIndex: number | null;
  node: ObjectRowNode | null;
  revision: number;
  onImage: (key: string, revision: number, image: string | null) => void;
}) {
  const key = node === null ? null : objectPreviewKey(node);
  const dock = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  // A stable portal host retains the renderer when it moves between the dock and popover.
  const [surface] = useState(() => {
    const element = document.createElement("div");
    element.className = "pointer-events-none absolute inset-0 size-full";
    element.setAttribute("aria-hidden", "true");
    return element;
  });
  const [ready, setReady] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const request = `${revision}:${key}`;
  useEffect(() => {
    setReady(null);
    setFailed(null);
  }, [request]);
  useLayoutEffect(() => {
    const parent = targetIndex === null ? dock.current : (popup.current ?? dock.current);
    if (parent && surface.parentElement !== parent) {
      parent.appendChild(surface);
    }

    surface.style.opacity = ready === request ? "1" : "0";
  });
  useLayoutEffect(() => () => surface.remove(), [surface]);
  const report = useCallback(
    (image: string | null) => {
      if (key !== null) {
        if (image !== null) {
          setReady(request);
        } else {
          setFailed(request);
        }
        onImage(key, revision, image);
      }
    },
    [key, revision, onImage, request],
  );

  useEffect(() => {
    if (key === null || ready === request || failed === request) {
      return;
    }

    const timer = window.setTimeout(() => report(null), JOB_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [key, ready, failed, request, report]);

  return (
    <>
      <div
        ref={dock}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 w-48 overflow-hidden opacity-0"
        style={{ aspectRatio: "1 / 0.72" }}
      />
      <Popover.Root
        open={targetIndex !== null}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <Popover.Portal>
          <Popover.Positioner
            anchor={() =>
              scroll.current?.querySelector<HTMLElement>(`[data-object-index="${targetIndex}"]`) ??
              null
            }
            side="right"
            align="start"
            sideOffset={10}
            collisionPadding={12}
          >
            <Popover.Popup
              initialFocus={false}
              finalFocus={false}
              aria-label={node?.name}
              className="w-96 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl"
              onPointerEnter={onEnter}
              onPointerLeave={onLeave}
            >
              <div className="border-b border-surface-veil-strong px-3 py-2 text-row font-medium text-surface-100">
                {node?.name}
              </div>
              <div
                ref={(element) => {
                  popup.current = element;
                  if (element && targetIndex !== null) element.appendChild(surface);
                }}
                className="relative aspect-[1/0.72] bg-surface-950/40"
              >
                {ready !== request && failed !== request && (
                  <span
                    role="status"
                    className="absolute inset-0 grid place-items-center text-meta text-surface-400"
                  >
                    {m.workshop_objects_loading_label()}
                  </span>
                )}
                {failed === request && (
                  <span
                    role="status"
                    className="absolute inset-0 grid place-items-center text-meta text-surface-400"
                  >
                    {m.workshop_objects_preview_failed_label()}
                  </span>
                )}
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      {createPortal(
        <ErrorBoundary key={revision} fallback={() => null}>
          <Suspense fallback={null}>
            <ObjectPreviewWorker node={failed === request ? null : node} onImage={report} />
          </Suspense>
        </ErrorBoundary>,
        surface,
      )}
    </>
  );
}

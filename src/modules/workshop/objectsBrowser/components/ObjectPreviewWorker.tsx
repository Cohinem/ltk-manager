import { lazy, Suspense } from "react";

import { ErrorBoundary } from "@/components";
import { Viewport } from "@/modules/viewport";

import { useObjectPreviewKind } from "../hooks/useObjectPreviewKind";
import { FAILED_OUTCOME, type PreviewOutcome } from "../state/previewStills";
import { drawsAtlas, objectPreviewKey } from "../utils/objectPreview";
import type { ObjectRowNode } from "../utils/objectTree";
import { PreviewSettled } from "./PreviewSettled";

const ObjectPreviewScene = lazy(() => import("./ObjectPreviewScene"));

/** The highest pixel ratio a preview renders at, for stills and played tiles. */
const MAX_DPR = 2;

interface ObjectPreviewWorkerProps {
  node: ObjectRowNode | null;
  playing: boolean;
  onOutcome: (outcome: PreviewOutcome) => void;
  /** Called as the preview advances: its bin opening, and each asset load it waits on. */
  onProgress: () => void;
}

/** A retained GPU surface for one slot in the grid's bounded preview pool. */
export default function ObjectPreviewWorker({
  node,
  playing,
  onOutcome,
  onProgress,
}: ObjectPreviewWorkerProps) {
  const kindOf = useObjectPreviewKind();
  /* The Atlas frame is the game's own pixels, which an anti-aliasing pass would blur. */
  const atlas = node !== null && drawsAtlas(kindOf(node));

  return (
    <Viewport
      active={node !== null}
      antiAliasing={atlas ? "off" : undefined}
      dpr={Math.min(window.devicePixelRatio, MAX_DPR)}
      gizmo={false}
      stage={false}
      textured={false}
      camera="orbit"
      clearColor="ground"
    >
      <Suspense fallback={null}>
        {node !== null && (
          <ErrorBoundary
            key={objectPreviewKey(node)}
            fallback={() => <PreviewSettled outcome={FAILED_OUTCOME} onOutcome={onOutcome} />}
          >
            <ObjectPreviewScene
              node={node}
              playing={playing}
              onOutcome={onOutcome}
              onProgress={onProgress}
            />
          </ErrorBoundary>
        )}
      </Suspense>
    </Viewport>
  );
}

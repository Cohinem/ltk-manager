import { lazy, Suspense, useEffect } from "react";

import { ErrorBoundary } from "@/components";
import { Viewport } from "@/modules/viewport";

import { objectPreviewKey } from "../utils/objectPreview";
import type { ObjectRowNode } from "../utils/objectTree";

const ObjectPreviewScene = lazy(() => import("./ObjectPreviewScene"));

interface ObjectPreviewWorkerProps {
  node: ObjectRowNode | null;
  onImage: (image: string | null) => void;
}

/** A retained GPU surface for one slot in the grid's bounded preview pool. */
export default function ObjectPreviewWorker({ node, onImage }: ObjectPreviewWorkerProps) {
  return (
    <Viewport
      active={node !== null}
      dpr={1}
      gizmo={false}
      stage={false}
      textured={false}
      camera="orbit"
    >
      <Suspense fallback={null}>
        {node !== null && (
          <ErrorBoundary
            key={objectPreviewKey(node)}
            fallback={() => <FailedPreview onImage={onImage} />}
          >
            <ObjectPreviewScene node={node} onImage={onImage} />
          </ErrorBoundary>
        )}
      </Suspense>
    </Viewport>
  );
}

function FailedPreview({ onImage }: Pick<ObjectPreviewWorkerProps, "onImage">) {
  useEffect(() => onImage(null), [onImage]);

  return null;
}

import { Viewport, type ViewportProps } from "@/modules/viewport";
import {
  usePreviewAntiAliasing,
  usePreviewCamera,
  usePreviewViewMode,
  usePreviewWireOverlay,
  useSetPreviewDisplay,
} from "@/stores";

export type PreviewViewportProps = Omit<
  ViewportProps,
  "camera" | "antiAliasing" | "viewMode" | "wireOverlay" | "onCameraStand"
> & {
  /** The scene draws lit whatever the view mode menu holds, for a preview without that menu. */
  readonly plainView?: boolean;
};

/**
 * A `Viewport` on the reader's display preferences: the camera preset, the anti-aliasing and
 * the view mode. A drag or a gizmo click that stands the camera records the preset it stood on.
 */
export function PreviewViewport({ plainView = false, ...props }: PreviewViewportProps) {
  const camera = usePreviewCamera();
  const antiAliasing = usePreviewAntiAliasing();
  const viewMode = usePreviewViewMode();
  const wireOverlay = usePreviewWireOverlay();
  const setDisplay = useSetPreviewDisplay();

  if (plainView) {
    return (
      <Viewport
        {...props}
        camera={camera}
        antiAliasing={antiAliasing}
        onCameraStand={(preset) => setDisplay({ previewCamera: preset })}
      />
    );
  }

  return (
    <Viewport
      {...props}
      camera={camera}
      antiAliasing={antiAliasing}
      viewMode={viewMode}
      wireOverlay={wireOverlay}
      onCameraStand={(preset) => setDisplay({ previewCamera: preset })}
    />
  );
}

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";

/**
 * Requests one frame after each commit of the component that renders it.
 *
 * For a viewport that draws on demand. The fibre requests a frame when a prop of a scene
 * object changes, and not when an effect changes an object directly, such as a texture
 * bound to a material that already exists. Rendered by a component, this requests a frame
 * each time that component renders.
 */
export function FrameOnCommit() {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    invalidate();
  });
  return null;
}

/**
 * Requests another frame during each frame, so the scene keeps drawing while this is
 * mounted.
 *
 * For content of an on-demand viewport that changes every frame and has no frame callback
 * of its own to request frames from.
 */
export function KeepFrames() {
  useFrame(({ invalidate }) => invalidate());
  return null;
}

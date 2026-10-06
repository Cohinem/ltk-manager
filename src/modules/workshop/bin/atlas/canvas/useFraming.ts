import { useEffect, useRef } from "react";

import type { PixelRect } from "../engine/layout/solve";
import { useFrameRequest } from "../state/atlasPreview";
import type { ViewTransformControl } from "./useViewTransform";

/** Frame the element a request for this view names, or fit the screen for a request naming none. */
export function useFraming(
  key: string,
  solved: ReadonlyMap<string, PixelRect> | null,
  transform: ViewTransformControl,
) {
  const request = useFrameRequest();
  const answered = useRef(request?.token ?? 0);

  useEffect(() => {
    if (request === null || request.view !== key || request.token === answered.current) return;

    answered.current = request.token;
    if (request.element === null) {
      transform.fit();
      return;
    }

    const rect = solved?.get(request.element);
    if (rect !== undefined) transform.frame(rect);
  }, [request, key, solved, transform]);
}

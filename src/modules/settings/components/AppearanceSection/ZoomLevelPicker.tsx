import { useEffect, useState } from "react";

import { NumberField, Slider } from "@/components";
import { useSetZoomLevel, useZoomLevel, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from "@/stores";

export function ZoomLevelPicker() {
  const zoomLevel = useZoomLevel();
  const setZoomLevel = useSetZoomLevel();
  const [preview, setPreview] = useState(zoomLevel);

  useEffect(() => {
    setPreview(zoomLevel);
  }, [zoomLevel]);

  return (
    <div className="flex items-center gap-3">
      <Slider
        value={preview}
        onValueChange={setPreview}
        onValueCommitted={setZoomLevel}
        min={ZOOM_MIN}
        max={ZOOM_MAX}
        step={ZOOM_STEP}
        aria-label="Zoom level"
      />
      <div className="flex shrink-0 items-center">
        <NumberField
          value={preview}
          onValueChange={(value) => {
            if (value !== null) setPreview(value);
          }}
          onValueCommitted={(value) => {
            if (value === null) setPreview(zoomLevel);
            else setZoomLevel(value);
          }}
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={ZOOM_STEP}
          aria-label="Zoom percent"
          className="w-11"
        />
        <span className="text-xs text-surface-400">%</span>
      </div>
    </div>
  );
}

import { IntersectThreeIcon } from "@phosphor-icons/react";

import { m } from "@/i18n";
import type { BackdropFlags } from "@/modules/viewport";

import { PreviewPopover } from "../../shared/preview/PreviewPopover";
import { BackdropVisibilityList } from "./BackdropVisibilityList";

export interface BackdropVisibilityControlProps {
  /** The layers, the controllers and their states, as `useBackdropFlags` returns them. */
  readonly backdrop: BackdropFlags;
}

/**
 * The visibility of a map backdrop, in a popover on the controls of a viewport that has no
 * Visibility pane.
 *
 * The reset returns to the map's opening flags and removes every override. The trigger
 * has the accent while a flag or a controller differs from the opening state.
 */
export function BackdropVisibilityControl({ backdrop }: BackdropVisibilityControlProps) {
  return (
    <PreviewPopover
      label={m.workshop_bin_preview_backdrop_visibility_label()}
      description={m.workshop_bin_preview_backdrop_visibility_description()}
      icon={<IntersectThreeIcon />}
      customized={backdrop.customized}
      onReset={backdrop.reset}
      resetLabel={m.workshop_bin_preview_backdrop_visibility_reset_action()}
      data-ui="BackdropVisibilityControl"
      className="w-96"
    >
      {/* DS-SCROLLBAR. The negative margin puts the scrollbar on the popover's edge. */}
      <div className="-mx-3 max-h-[60vh] overflow-y-auto px-3 scrollbar-md">
        <BackdropVisibilityList backdrop={backdrop} />
      </div>
    </PreviewPopover>
  );
}

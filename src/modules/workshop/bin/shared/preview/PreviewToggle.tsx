import type { ReactNode } from "react";

import { HexshadeIcon, IconButton } from "@/components";
import { m } from "@/i18n";
import {
  type PreviewDisplay,
  type PreviewFlag,
  usePreviewFlag,
  useSetPreviewDisplay,
} from "@/stores";

export interface PreviewToggleProps {
  readonly flag: PreviewFlag;
  readonly label: string;
  readonly icon: ReactNode;
}

/** A preview switch bound to one display preference, named on hover. */
export function PreviewToggle({ flag, label, icon }: PreviewToggleProps) {
  const on = usePreviewFlag(flag);
  const setDisplay = useSetPreviewDisplay();

  return (
    <IconButton
      pressed={on}
      icon={icon}
      onClick={() => setDisplay({ [flag]: !on } as Partial<PreviewDisplay>)}
      label={label}
    />
  );
}

/** The switch for drawing materials with the game's own shaders, translated. */
export function ShadersToggle() {
  const shaders = usePreviewFlag("previewShaders");

  return (
    <PreviewToggle
      flag="previewShaders"
      label={m.workshop_bin_preview_shaders_label()}
      icon={<HexshadeIcon className={shaders ? "size-4" : "size-4 grayscale"} />}
    />
  );
}

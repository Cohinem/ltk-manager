import { CircleHalfIcon } from "@phosphor-icons/react";

import { IconButton } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import {
  type PreviewBackdrop,
  useCyclePreviewBackdrop,
  usePreviewBackdrop,
} from "../state/previewBackdrop";

const TONE_LABEL: Record<PreviewBackdrop, () => string> = {
  dark: m.workshop_bin_preview_backdrop_dark_label,
  grey: m.workshop_bin_preview_backdrop_grey_label,
  light: m.workshop_bin_preview_backdrop_light_label,
};

/** The switch that steps every emitter preview's ground from dark to grey to light. */
export function BackdropButton({ className }: { className?: string }) {
  const backdrop = usePreviewBackdrop();
  const cycle = useCyclePreviewBackdrop();
  const label = m.workshop_bin_preview_backdrop_action({ tone: TONE_LABEL[backdrop]() });

  return (
    <IconButton
      compact={false}
      className={twMerge("nodrag", className)}
      icon={<CircleHalfIcon />}
      onClick={cycle}
      label={label}
    />
  );
}

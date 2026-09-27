import {
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  CornersOutIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  MonitorPlayIcon,
  RepeatIcon,
} from "@phosphor-icons/react";
import { Panel, useReactFlow } from "@xyflow/react";
import type { ReactNode } from "react";

import { IconButton, Tooltip } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

interface GraphControlsProps {
  onFit: () => void;
  onCollapseAll: (collapsed: boolean) => void;
  previewed: boolean;
  onPreviewedChange: (previewed: boolean) => void;
  looped: boolean;
  onLoopedChange: (looped: boolean) => void;
}

/**
 * Zoom, fit, collapse or expand every node, the preview node's switch and the node surfaces'
 * loop, in the canvas's top-right corner.
 */
export function GraphControls({
  onFit,
  onCollapseAll,
  previewed,
  onPreviewedChange,
  looped,
  onLoopedChange,
}: GraphControlsProps) {
  const flow = useReactFlow();
  const previewLabel = previewed
    ? m.workshop_bin_graph_preview_hide_action()
    : m.workshop_bin_graph_preview_show_action();

  return (
    <Panel
      position="top-right"
      /* DS-GROUND, DS-RADIUS */
      className="flex items-center gap-0.5 rounded-lg border border-surface-veil-strong bg-surface-800 p-0.5 shadow-md"
    >
      <ControlButton
        label={m.workshop_bin_graph_zoom_in_action()}
        onPress={() => void flow.zoomIn({ duration: 150 })}
      >
        <MagnifyingGlassPlusIcon weight="bold" className="h-4 w-4" />
      </ControlButton>
      <ControlButton
        label={m.workshop_bin_graph_zoom_out_action()}
        onPress={() => void flow.zoomOut({ duration: 150 })}
      >
        <MagnifyingGlassMinusIcon weight="bold" className="h-4 w-4" />
      </ControlButton>
      <ControlButton label={m.workshop_bin_graph_fit_action()} onPress={onFit}>
        <CornersOutIcon weight="bold" className="h-4 w-4" />
      </ControlButton>
      <ControlButton
        label={m.workshop_bin_graph_collapse_all_action()}
        onPress={() => onCollapseAll(true)}
      >
        <ArrowsInSimpleIcon weight="bold" className="h-4 w-4" />
      </ControlButton>
      <ControlButton
        label={m.workshop_bin_graph_expand_all_action()}
        onPress={() => onCollapseAll(false)}
      >
        <ArrowsOutSimpleIcon weight="bold" className="h-4 w-4" />
      </ControlButton>
      <ControlButton
        label={previewLabel}
        pressed={previewed}
        onPress={() => onPreviewedChange(!previewed)}
      >
        <MonitorPlayIcon weight="bold" className="h-4 w-4" />
      </ControlButton>
      <ControlButton
        label={m.workshop_bin_graph_surface_loop_action()}
        pressed={looped}
        onPress={() => onLoopedChange(!looped)}
      >
        <RepeatIcon weight="bold" className="h-4 w-4" />
      </ControlButton>
    </Panel>
  );
}

function ControlButton({
  label,
  pressed,
  onPress,
  children,
}: {
  label: string;
  /** The button is a switch, and this is its state. Absent for a one-shot action. */
  pressed?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip content={label}>
      <IconButton
        variant="ghost"
        size="xs"
        aria-label={label}
        aria-pressed={pressed}
        /* DS-VEIL */
        className={twMerge(pressed === true && "bg-surface-veil-strong text-accent-400")}
        icon={children}
        onClick={onPress}
      />
    </Tooltip>
  );
}

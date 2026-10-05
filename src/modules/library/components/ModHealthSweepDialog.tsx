import { useRef } from "react";

import { Dialog } from "@/components";

import { ModHealthSweepPanel } from "./ModHealthSweepPanel";

interface ModHealthSweepDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * What the sweep found, in the middle of a dimmed library.
 *
 * Per "The status bar item and the drawer" in docs/ux/MOD_HEALTH.md. The panel
 * inside it is [`ModHealthSweepPanel`], which [`ModHealthSweepDrawer`] also
 * draws - this shell is the placing and nothing else.
 */
export function ModHealthSweepDialog({ open, onClose }: ModHealthSweepDialogProps) {
  const panel = useRef<HTMLDivElement>(null);

  return (
    /* Focus starts on the panel rather than on its first tab stop, which is Close. A list
       this long opens saying what to read, not how to leave. */
    <Dialog.Frame
      open={open}
      onClose={onClose}
      ref={panel}
      size="lg"
      initialFocus={panel}
      data-ui="ModHealthSweepDialog"
      aria-label="What the check found"
      className="h-[70vh] max-w-[38.5rem] overflow-hidden"
    >
      <ModHealthSweepPanel onClose={onClose} />
    </Dialog.Frame>
  );
}

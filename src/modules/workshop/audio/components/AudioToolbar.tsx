import { createContext, type ReactNode, type Ref, use } from "react";
import { createPortal } from "react-dom";

import { Count } from "@/components";
import { DocumentToolbar, useNarrowToolbar } from "@/modules/editor";

/** The element of the toolbar row that the open panel's tools render into. */
export const AudioToolsSlotContext = createContext<HTMLElement | null>(null);

interface AudioToolbarProps {
  /** This document is the one on screen. Only the active document's toolbar shows. */
  readonly active: boolean;
  /** The menu bar of the document. */
  readonly menubar: ReactNode;
  /** The Media and Events switch. Empty if the file has no hierarchy. */
  readonly views: ReactNode;
  /** Receives the element that `AudioPanelTools` renders into. */
  readonly toolsRef: Ref<HTMLSpanElement>;
  /** Receives the row, which the details popover opens under. */
  readonly rowRef?: Ref<HTMLDivElement>;
}

/**
 * The one row of the audio file document, in the toolbar row of its surface: the menu bar, the
 * view switch and the tools of the open panel.
 *
 * A panel adds its tools through `AudioPanelTools`, so its state stays in the panel. Per "The audio
 * file document" in docs/ux/AUDIO.md.
 */
export function AudioToolbar({ active, menubar, views, toolsRef, rowRef }: AudioToolbarProps) {
  return (
    <DocumentToolbar active={active}>
      <div
        ref={rowRef}
        data-ui="AudioToolbar"
        className="flex min-w-0 flex-1 items-center gap-2 text-meta text-surface-400 select-none"
      >
        {menubar}
        {views}
        <span ref={toolsRef} className="contents" />
      </div>
    </DocumentToolbar>
  );
}

interface AudioPanelToolsProps {
  readonly filter: ReactNode;
  /** The count of the rows of the panel, hidden on a narrow toolbar. */
  readonly count?: string;
  /** A name entry or a picker that a menu command opened, drawn while it is open. */
  readonly entry?: ReactNode;
}

/**
 * The tools of one panel of the audio file document, drawn at the end of `AudioToolbar`.
 *
 * The filter keeps its width while the menu titles fold into the overflow menu, and then narrows
 * to a floor. Draws nothing while the document is not on screen, because the toolbar has no slot
 * then.
 */
export function AudioPanelTools({ filter, count, entry }: AudioPanelToolsProps) {
  const slot = use(AudioToolsSlotContext);
  const narrow = useNarrowToolbar();
  if (slot === null) return null;

  return createPortal(
    <>
      <span className="flex w-56 min-w-32 shrink items-center">{filter}</span>
      {count !== undefined && !narrow && <Count>{count}</Count>}
      {entry}
    </>,
    slot,
  );
}

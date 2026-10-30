import { ArrowUUpLeftIcon, ArrowUUpRightIcon, FloppyDiskIcon } from "@phosphor-icons/react";
import { createContext, type ReactNode, type Ref, use } from "react";
import { createPortal } from "react-dom";

import { Count, IconButton } from "@/components";
import { m } from "@/i18n";
import { DocumentToolbar, useNarrowToolbar } from "@/modules/editor";

import { KeyHint } from "../../bin/atlas/components/KeyHint";
import type { BankDocument } from "../hooks/useBankDocument";
import { shortcutOf } from "../utils/keymap";

/** The element of the toolbar that the open panel's tools render into. */
export const AudioToolsSlotContext = createContext<HTMLElement | null>(null);

interface AudioToolbarProps {
  /** This document is the one on screen. Only the active document's toolbar shows. */
  readonly active: boolean;
  /** Save, Undo and Redo. Empty if the file takes no edits. */
  readonly history: ReactNode;
  /** The Media and Events switch. Empty if the file has no hierarchy. */
  readonly views: ReactNode;
  /** Receives the element that `AudioPanelTools` renders into. */
  readonly toolsRef: Ref<HTMLSpanElement>;
  /** The Loop switch, the preview volume and the mark of the keys and gestures. */
  readonly transport: ReactNode;
  /** The bank unit menu. Empty for a file that no unit can name. */
  readonly unit: ReactNode;
  /** The kebab of the file. */
  readonly menu: ReactNode;
}

/**
 * The one row of controls of the audio file document, in the toolbar row of its surface.
 *
 * From the left: the history, the view switch, the tools of the open panel, the transport, the
 * bank unit menu and the kebab. A panel adds its tools through `AudioPanelTools`, so its state stays in the
 * panel. Per "The audio file document" in docs/ux/AUDIO.md.
 */
export function AudioToolbar({
  active,
  history,
  views,
  toolsRef,
  transport,
  unit,
  menu,
}: AudioToolbarProps) {
  return (
    <DocumentToolbar active={active}>
      <div
        data-ui="AudioToolbar"
        className="flex min-w-0 flex-1 items-center gap-2 text-meta text-surface-400 select-none"
      >
        {Boolean(history) && (
          <>
            {history}
            <Divider />
          </>
        )}
        {views}
        <span ref={toolsRef} className="contents" />
        {transport}
        {unit}
        {menu}
      </div>
    </DocumentToolbar>
  );
}

function Divider() {
  return <span aria-hidden className="h-4 w-px shrink-0 bg-surface-700" />;
}

interface AudioPanelToolsProps {
  readonly filter: ReactNode;
  /** The count of the rows of the panel, hidden on a narrow toolbar. */
  readonly count?: string;
  /** The count of the selected rows. */
  readonly selection?: ReactNode;
  /** The action that adds a row, such as `+ New event`. */
  readonly create?: ReactNode;
  /** The switches of the panes beside the panel, such as the inspector. */
  readonly panes?: ReactNode;
}

/**
 * The tools of one panel of the audio file document, drawn in the middle of `AudioToolbar`.
 *
 * Draws nothing while the document is not on screen, because the toolbar has no slot then.
 */
export function AudioPanelTools({ filter, count, selection, create, panes }: AudioPanelToolsProps) {
  const slot = use(AudioToolsSlotContext);
  const narrow = useNarrowToolbar();
  if (slot === null) return null;

  return createPortal(
    <>
      {filter}
      {count !== undefined && !narrow && <Count>{count}</Count>}
      {selection}
      {create}
      {panes}
    </>,
    slot,
  );
}

const SAVE_KEY = shortcutOf("save") ?? "";
const UNDO_KEY = shortcutOf("undo") ?? "";
const REDO_KEY = shortcutOf("redo") ?? "";

/**
 * Save, Undo and Redo of an event bank open for edits, each with its key in the tooltip.
 *
 * Save is enabled while the bank holds unsaved edits. Undo and Redo are enabled while the
 * document counts a step in their direction.
 */
export function BankHistory({ bank }: { bank: BankDocument }) {
  const dirty = bank.state?.dirty === true;

  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <IconButton
        icon={<FloppyDiskIcon />}
        aria-label={m.audio_toolbar_save_action()}
        aria-keyshortcuts={SAVE_KEY}
        tooltip={<KeyHint label={m.audio_toolbar_save_action()} shortcut={SAVE_KEY} />}
        disabled={!dirty}
        onClick={() => void bank.save().catch(() => {})}
      />
      <IconButton
        icon={<ArrowUUpLeftIcon />}
        aria-label={m.audio_toolbar_undo_action()}
        aria-keyshortcuts={UNDO_KEY}
        tooltip={<KeyHint label={m.audio_toolbar_undo_action()} shortcut={UNDO_KEY} />}
        disabled={bank.history.undo === 0}
        onClick={() => void bank.step("undo")}
      />
      <IconButton
        icon={<ArrowUUpRightIcon />}
        aria-label={m.audio_toolbar_redo_action()}
        aria-keyshortcuts={REDO_KEY}
        tooltip={<KeyHint label={m.audio_toolbar_redo_action()} shortcut={REDO_KEY} />}
        disabled={bank.history.redo === 0}
        onClick={() => void bank.step("redo")}
      />
    </span>
  );
}

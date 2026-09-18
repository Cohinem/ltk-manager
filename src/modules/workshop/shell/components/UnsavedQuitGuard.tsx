import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";

import { useToast } from "@/components";
import { errorMessage, m } from "@/i18n";
import {
  flushDocumentSaves,
  saveDocuments,
  UnsavedCloseDialog,
  type UnsavedAnswer,
  unwritableDocumentIds,
} from "@/modules/editor";

import { unsavedDocumentIds } from "../state/workshopEditor";

/** The question a quit raises, per "Quitting with unsaved edits" in docs/ux/PROJECT_EDITOR.md. */
interface QuitQuestion {
  /** How many documents hold unsaved edits, which the question names. */
  count: number;
  /** A Save all is being written. */
  saving: boolean;
}

/**
 * Guards the window's close request while a document holds unsaved edits.
 *
 * Mounted inside the project editor, because that is where a dirty document is:
 * a document reports its dirty flag while it is mounted and clears it on the way
 * out, so no other route has anything unwritten to lose.
 */
export function UnsavedQuitGuard() {
  const [question, setQuestion] = useState<QuitQuestion | null>(null);
  const toast = useToast();

  /** Settles the standing question with what the reader pressed. */
  const answered = useRef<((answer: UnsavedAnswer) => void) | null>(null);
  /** A close request is already being decided, so a second one changes nothing. */
  const deciding = useRef(false);
  const report = useRef(toast.error);
  useEffect(() => {
    report.current = toast.error;
  });

  useEffect(() => {
    const appWindow = getCurrentWindow();

    const listening = appWindow.onCloseRequested(async (event) => {
      /* Tauri closes the window itself for a handler that lets the request
         through, so every path out of here either destroys or stays open. */
      event.preventDefault();
      if (deciding.current) return;
      deciding.current = true;

      try {
        await flushDocumentSaves();

        const unsaved = unsavedDocumentIds();
        if (unsaved.length > 0 && !(await settled(unsaved))) return;
      } finally {
        deciding.current = false;
        setQuestion(null);
      }

      await appWindow.destroy();
    });

    /** Whether the reader let the quit through, having answered for `unsaved`. */
    async function settled(unsaved: readonly string[]): Promise<boolean> {
      const answer = await new Promise<UnsavedAnswer>((resolve) => {
        answered.current = resolve;
        setQuestion({ count: unsaved.length, saving: false });
      });
      if (answer === "cancel") return false;
      if (answer === "discard") return true;

      /* A document nothing can write from here would be dropped silently, so
         the quit stands down and names how many are waiting on their own tab. */
      const unwritable = unwritableDocumentIds(unsaved);
      if (unwritable.length > 0) {
        report.current(m.editor_quit_save_missing_hint({ count: unwritable.length }));
        return false;
      }

      try {
        await saveDocuments(unsaved);
      } catch (error) {
        report.current(m.editor_quit_save_failed_hint({ reason: errorMessage(error) }));
        return false;
      }
      return true;
    }

    return () => {
      void listening.then((stop) => stop());
    };
  }, []);

  function settle(answer: UnsavedAnswer) {
    if (answer === "save") setQuestion((standing) => standing && { ...standing, saving: true });
    answered.current?.(answer);
    answered.current = null;
  }

  return (
    <UnsavedCloseDialog
      open={question !== null}
      title={m.editor_quit_unsaved_title()}
      description={m.editor_quit_unsaved_hint({ count: question?.count ?? 0 })}
      saveLabel={m.editor_quit_save_all_action()}
      discardLabel={m.editor_unsaved_discard_action()}
      saving={question?.saving === true}
      onAnswer={settle}
    />
  );
}

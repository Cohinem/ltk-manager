import { ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react";
import { useCallback, useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { IconButton, Tooltip } from "@/components";

import { useContentEditors } from "../documents";
import { useHistoryReach, useNavigateHistory, useOpenDocuments } from "../state";

/* The fourth and fifth mouse buttons, which every browser and file manager
   already spends on back and forward. */
const MOUSE_BACK = 3;
const MOUSE_FORWARD = 4;

/**
 * The two arrows that walk this project's navigation history.
 *
 * This is the Go Back of an editor rather than the Back of a browser, so it
 * answers where a user was in the project and not which page the application
 * showed. `Alt+←` and `Alt+→` are the keys, and the mouse's side buttons do the
 * same.
 */
export function NavigationArrows() {
  const reach = useHistoryReach();
  const navigateHistory = useNavigateHistory();

  const goBack = useCallback(() => navigateHistory(-1), [navigateHistory]);
  const goForward = useCallback(() => navigateHistory(1), [navigateHistory]);

  useHotkeys("alt+left", goBack, { preventDefault: true, enableOnFormTags: true });
  useHotkeys("alt+right", goForward, { preventDefault: true, enableOnFormTags: true });

  useEffect(() => {
    function onMouseDown(event: MouseEvent) {
      if (event.button !== MOUSE_BACK && event.button !== MOUSE_FORWARD) return;
      event.preventDefault();
      if (event.button === MOUSE_BACK) goBack();
      else goForward();
    }

    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [goBack, goForward]);

  return (
    <div data-ui="NavigationArrows" className="flex shrink-0 items-center">
      <Arrow direction="back" documentId={reach.back} onClick={goBack} />
      <Arrow direction="forward" documentId={reach.forward} onClick={goForward} />
    </div>
  );
}

interface ArrowProps {
  direction: "back" | "forward";
  /** What the arrow returns to, or null while it has nothing behind it. */
  documentId: string | null;
  onClick: () => void;
}

function Arrow({ direction, documentId, onClick }: ArrowProps) {
  const title = useDocumentTitle(documentId);
  const back = direction === "back";
  const label = back ? "Back" : "Forward";

  const button = (
    <IconButton
      icon={
        back ? (
          <ArrowLeftIcon weight="bold" className="h-4 w-4" />
        ) : (
          <ArrowRightIcon weight="bold" className="h-4 w-4" />
        )
      }
      variant="ghost"
      size="sm"
      compact
      disabled={documentId === null}
      onClick={onClick}
      aria-label={label}
    />
  );

  if (documentId === null) return button;

  return <Tooltip content={`${label} to ${title} (${back ? "Alt+←" : "Alt+→"})`}>{button}</Tooltip>;
}

/** What a document is called on a tab, which is what the tooltip names. */
function useDocumentTitle(documentId: string | null): string {
  const documents = useOpenDocuments();
  const editors = useContentEditors();

  const document = documents.find((candidate) => candidate.id === documentId);
  if (!document) return "where you were";

  /* The registry narrows to one kind per key, which a lookup by a union's own
     kind cannot express. The key comes off the document, so the two agree. */
  const definition = editors[document.kind] as {
    label: (document: never) => { title: string };
  };
  return definition.label(document as never).title;
}

import { type ReactNode, useCallback, useMemo, useState } from "react";

import { RetainedContent } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { useLeafCloses } from "../state/leafCloses";
import { NO_SHARED_TITLES } from "../tabTitles";
import type { EditorDocumentBase, EditorDocumentDefinition, EditorRegistry } from "../types";
import { useCloseQueue } from "../useCloseQueue";
import { useEditorKeys } from "../useEditorKeys";
import { DocumentToolbarSlotContext } from "./DocumentToolbar";
import { EditorTabs } from "./EditorTabs";
import { UnsavedCloseDialog } from "./UnsavedCloseDialog";

export interface EditorSurfaceProps<D extends EditorDocumentBase> {
  /** The leaf this surface draws, which the strip scopes its drag ids by. */
  leafId: string;
  documents: readonly D[];
  activeId: string | null;
  registry: EditorRegistry<D>;
  /** Documents whose editor has reported unsaved edits. */
  dirtyIds: ReadonlySet<string>;
  /** Documents a user pinned. They lead the strip, and a batch close passes them over. */
  pinnedIds: readonly string[];
  /** The ephemeral tab, which draws in italic. Null when the strip holds none. */
  previewId?: string | null;
  /** Titles more than one open document carries, whose tabs name their layer. */
  sharedTitles?: ReadonlySet<string>;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  /** The keyboard route to a split, offered from a tab's context menu. */
  onSplit?: (id: string, edge: "right" | "bottom") => void;
  /** A double click on a tab, which keeps an ephemeral one. */
  onPromote?: (id: string) => void;
  /** Absent leaves the strip without a pin, for a host whose tabs are all alike. */
  onTogglePin?: (id: string, pinned: boolean) => void;
  /** This group takes a document only from a gesture that names it. */
  locked?: boolean;
  /** Absent leaves the strip without a lock, for a host whose groups all take an open. */
  onToggleLock?: (locked: boolean) => void;
  /** A double click on a kept tab, which fills the grid with this surface. */
  onMaximize?: () => void;
  /** A pointer landing anywhere in the surface, tab strip or document body. */
  onFocus?: () => void;
  /** Where a find goes for an active document with no search box of its own. */
  onFindElsewhere?: () => void;
  /** This leaf holds the layout's focus, so its active tab carries the accent rail. */
  focused?: boolean;
  /** Shown while nothing is open. */
  empty?: ReactNode;
  className?: string;
}

/**
 * A tab strip over a stack of open documents, in the shape an IDE uses.
 *
 * Every open document stays mounted and inactive ones are hidden, so
 * scroll position and half-typed edits survive a trip to another tab.
 * Closing one with unsaved edits asks first.
 *
 * The focused group answers the editor's keys, per "The editor's keys" in
 * `docs/ux/PROJECT_EDITOR.md`.
 *
 * The row under the strip is a slot the active document fills through
 * {@link DocumentToolbar}, rather than chrome this surface is handed.
 */
export function EditorSurface<D extends EditorDocumentBase>({
  leafId,
  documents,
  activeId,
  registry,
  dirtyIds,
  pinnedIds,
  previewId,
  sharedTitles = NO_SHARED_TITLES,
  onActivate,
  onClose,
  onSplit,
  onPromote,
  onTogglePin,
  locked,
  onToggleLock,
  onMaximize,
  onFocus,
  onFindElsewhere,
  focused,
  empty,
  className,
}: EditorSurfaceProps<D>) {
  const [toolbar, setToolbar] = useState<HTMLElement | null>(null);

  /* The registry narrows to one kind per key, which a lookup by a union's own
     kind cannot express. The key comes off the document, so the two agree. */
  const definitionFor = useCallback(
    (document: D): EditorDocumentDefinition<D> | undefined => {
      const definition = registry[document.kind as D["kind"]];
      return definition as unknown as EditorDocumentDefinition<D> | undefined;
    },
    [registry],
  );

  /* Each tab carries a freshly built icon element, so deriving these inline
     handed the strip a new object per tab on every render of this component -
     a dialog opening was enough to repaint every tab. */
  const tabs = useMemo(
    () =>
      documents.flatMap((document) => {
        const definition = definitionFor(document);
        if (!definition) return [];

        const { title, context, layer, path } = definition.label(document);
        return [
          {
            id: document.id,
            title,
            context: context ?? (sharedTitles.has(title) ? layer : undefined),
            path,
            icon: definition.icon(document),
            dirty: dirtyIds.has(document.id),
            preview: document.id === previewId,
            pinned: pinnedIds.includes(document.id),
            menu: definition.tabMenu?.(document),
          },
        ];
      }),
    [documents, definitionFor, dirtyIds, pinnedIds, previewId, sharedTitles],
  );

  const close = useCloseQueue({
    documents,
    dirtyIds,
    pinnedIds,
    titleOf: (document) => definitionFor(document)?.label(document).title,
    onClose,
    onActivate,
  });

  useLeafCloses(leafId, close);

  const documentIds = useMemo(() => documents.map((document) => document.id), [documents]);

  useEditorKeys({
    enabled: focused === true,
    documentIds,
    activeId,
    onActivate,
    onClose: close.closeOne,
    onFindElsewhere,
  });

  return (
    <div
      data-ui={`EditorSurface:${leafId}`}
      onPointerDownCapture={onFocus}
      className={twMerge(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-900",
        className,
      )}
    >
      <EditorTabs
        leafId={leafId}
        tabs={tabs}
        activeId={activeId}
        onActivate={onActivate}
        onClose={close.closeOne}
        onCloseOthers={close.closeOthers}
        onCloseToRight={close.closeToRight}
        onCloseAll={close.closeAll}
        onSplit={onSplit}
        onPromote={onPromote}
        onTogglePin={onTogglePin}
        locked={locked}
        onToggleLock={onToggleLock}
        onMaximize={onMaximize}
        focused={focused}
      />

      {/* `empty:hidden` rather than a conditional, because what fills this row
          arrives through a portal and so cannot be read from here. */}
      <div
        ref={setToolbar}
        data-ui="EditorSurface:toolbar"
        className="flex shrink-0 items-center gap-2 border-b border-surface-700/50 px-2 py-1.5 empty:hidden"
      />

      <div data-ui="EditorSurface:documents" className="relative min-h-0 flex-1 overflow-hidden">
        {documents.length === 0 && empty}

        <DocumentToolbarSlotContext value={toolbar}>
          {documents.map((document) => {
            const definition = definitionFor(document);
            if (!definition) return null;

            const Editor = definition.component;
            const active = document.id === activeId;

            return (
              <RetainedContent
                key={document.id}
                data-ui={`EditorSurface:document:${document.kind}`}
                active={active}
                className="absolute inset-0 flex flex-col"
              >
                <Editor document={document} active={active} />
              </RetainedContent>
            );
          })}
        </DocumentToolbarSlotContext>
      </div>

      <UnsavedCloseDialog
        open={close.question !== null}
        title={m.editor_unsaved_close_title()}
        description={m.editor_unsaved_close_hint({ title: close.question?.title ?? "" })}
        saveLabel={close.question?.saves === true ? m.editor_unsaved_save_action() : undefined}
        discardLabel={m.editor_unsaved_discard_action()}
        saving={close.saving}
        onAnswer={close.answer}
      />
    </div>
  );
}

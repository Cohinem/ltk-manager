import { PushPinIcon, XIcon } from "@phosphor-icons/react";
import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { IconButton, Skeleton, Tabs } from "@/components";
import { m } from "@/i18n";
import type { InstalledMod } from "@/lib/tauri";
import { modQueries } from "@/modules/library/api";
import { useModThumbnail } from "@/modules/library/api/useModThumbnail";
import { type DocumentsTab, useLibrarySidebarStore } from "@/modules/library/state";
import { twMerge } from "@/utils";

import { DetailsCover } from "./DetailsCover";
import { DetailsTab } from "./DetailsTab";
import { DocumentBody, DocumentGate } from "./DocumentBody";
import { LicensesTab } from "./LicensesTab";
import { ReadmeTab } from "./ReadmeTab";

/** How long the docked panel waits on one mod before reading its archive. */
const REST_MS = 150;

interface DocumentsSidebarProps {
  /** Every installed mod, which the licenses tab lists and the readme tab names. */
  mods: InstalledMod[];
  /**
   * Whether the panel is docked beside the table rather than a drawer over the grid.
   *
   * Docked, the cover sits above the tabs, a pin replaces the close button, and
   * an archive read waits for the pointer to rest. Per "The panel follows the
   * pointer" in docs/ux/LIBRARY.md.
   */
  docked?: boolean;
}

/**
 * What one installed mod is, in a panel the reader opened.
 *
 * Draws on the page ground with a hairline, the way the toolbar and the session
 * bar already do, which is what lets a rendered document sit on the ground with
 * no inset frame of its own. The strip therefore has no rung to mark itself
 * with and leans on that hairline and on type. [`LibraryBody`] is what puts it
 * over the grid or beside the table.
 */
export function DocumentsSidebar({ mods, docked = false }: DocumentsSidebarProps) {
  const tab = useLibrarySidebarStore((s) => s.tab);
  const showTab = useLibrarySidebarStore((s) => s.showTab);
  const close = useLibrarySidebarStore((s) => s.close);
  const modId = useLibrarySidebarStore((s) => s.modId);
  const editing = useLibrarySidebarStore((s) => s.editing);

  const openMod = mods.find((mod) => mod.id === modId) ?? null;
  const missing = modId !== null && openMod === null;
  const panel = useRef<HTMLDivElement>(null);

  /* Focus lands on the panel rather than on its chrome, so the reader's first
     tab stop is what they opened it for. A dock is never opened, so it leaves
     focus where the reader put it. */
  useEffect(() => {
    if (!docked) panel.current?.focus();
  }, [docked]);

  return (
    <div
      ref={panel}
      tabIndex={-1}
      data-ui="DocumentsSidebar"
      aria-label={m.library_documents_title()}
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-surface-700 bg-surface-950 outline-none"
    >
      {docked && openMod && !(editing && tab === "details") && <DockCover mod={openMod} />}

      <Tabs.Root
        value={tab}
        onValueChange={(value) => showTab(value as DocumentsTab)}
        className="min-h-0 flex-1"
      >
        <div className="flex shrink-0 items-center border-b border-surface-700 select-none">
          <Tabs.List divider={false} className="min-w-0 flex-1 scrollbar-sm">
            <Tabs.Tab value="details">{m.library_documents_details_tab()}</Tabs.Tab>
            <Tabs.Tab value="readme">{m.library_documents_readme_tab()}</Tabs.Tab>
            <Tabs.Tab value="licenses">{m.library_documents_licenses_tab()}</Tabs.Tab>
          </Tabs.List>
          {!docked && (
            <IconButton
              size="md"
              icon={<XIcon />}
              onClick={close}
              className="mr-1 shrink-0"
              label={m.library_documents_close_action()}
            />
          )}
        </div>

        {!docked && <Header mod={openMod} />}

        <Tabs.Panel value="details" className="flex min-h-0 flex-1 flex-col">
          <DocumentGate
            mod={openMod}
            missing={missing}
            emptyTitle={m.library_details_none_open_title()}
            emptyDescription={m.library_details_none_open_description()}
          >
            {(mod) => <DetailsTab mod={mod} showCover={!docked} />}
          </DocumentGate>
        </Tabs.Panel>
        <Tabs.Panel value="readme" className="flex min-h-0 flex-1 flex-col">
          <DocumentGate
            mod={openMod}
            missing={missing}
            emptyTitle={m.library_readme_none_open_title()}
            emptyDescription={m.library_readme_none_open_description()}
          >
            {(mod) => (
              <RestGate
                active={docked}
                modId={mod.id}
                queryKey={modQueries.readme(mod.id).queryKey}
              >
                <ReadmeTab mod={mod} />
              </RestGate>
            )}
          </DocumentGate>
        </Tabs.Panel>
        <Tabs.Panel value="licenses" className="flex min-h-0 flex-1 flex-col">
          <DocumentGate
            mod={openMod}
            missing={missing}
            emptyTitle={m.library_licenses_none_open_title()}
            emptyDescription={m.library_licenses_none_open_description()}
          >
            {(mod) => (
              <RestGate
                active={docked && mod.license != null}
                modId={mod.id}
                queryKey={modQueries.licenseText(mod.id).queryKey}
              >
                <LicensesTab mod={mod} />
              </RestGate>
            )}
          </DocumentGate>
        </Tabs.Panel>
      </Tabs.Root>
    </div>
  );
}

/**
 * What the panel is holding, for a reader who left it open and came back.
 *
 * The name sits here rather than on the tab, so the strip does not shift under
 * the pointer as one mod's name gives way to another's, and a long one has
 * somewhere to go.
 */
function Header({ mod }: { mod: InstalledMod | null }) {
  return (
    <div className="flex shrink-0 items-center border-b border-surface-700 px-3 py-2 select-none">
      <p className="min-w-0 flex-1 truncate text-row font-medium text-surface-200 select-text">
        {headerTitle(mod)}
      </p>
    </div>
  );
}

function headerTitle(mod: InstalledMod | null): string {
  if (mod) return mod.displayName;
  return m.library_documents_no_mod_title();
}

/** The docked panel's cover, with the pin over its corner. */
function DockCover({ mod }: { mod: InstalledMod }) {
  const { data: thumbnailUrl } = useModThumbnail(mod.id);
  const pinned = useLibrarySidebarStore((s) => s.pinned);
  const togglePinned = useLibrarySidebarStore((s) => s.togglePinned);

  /* DS-INVARIANT: the chip sits on cover art, so it keeps one tone in both themes. */
  return (
    <DetailsCover mod={mod} thumbnailUrl={thumbnailUrl}>
      <button
        type="button"
        aria-pressed={pinned}
        title={m.library_documents_pin_hint()}
        onClick={togglePinned}
        className={twMerge(
          "absolute top-2 right-2 z-[1] flex h-7 items-center gap-1.5 rounded-md px-2 text-meta font-medium text-brand-on transition-colors select-none",
          pinned ? "bg-accent-500" : "bg-scrim/70 backdrop-blur-sm hover:bg-scrim/90",
        )}
      >
        <PushPinIcon weight={pinned ? "fill" : "bold"} className="size-3.5" />
        {pinned ? m.library_documents_pinned_label() : m.library_documents_pin_action()}
      </button>
    </DetailsCover>
  );
}

/**
 * Holds back an archive read until the pointer has rested on one mod.
 *
 * An answer already in the cache shows at once, so a mod read before costs nothing.
 */
function RestGate({
  active,
  modId,
  queryKey,
  children,
}: {
  active: boolean;
  modId: string;
  queryKey: QueryKey;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [settled, setSettled] = useState(modId);
  const cached = queryClient.getQueryData(queryKey) !== undefined;

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(modId), REST_MS);
    return () => window.clearTimeout(timer);
  }, [modId]);

  if (!active || cached || settled === modId) return children;

  return (
    <DocumentBody>
      <div className="flex w-full flex-col gap-2.5 p-4">
        <Skeleton width="55%" height="0.9rem" />
        <Skeleton count={3} height="0.65rem" />
        <Skeleton width="40%" height="0.65rem" className="mt-2" />
        <Skeleton count={2} height="0.65rem" />
      </div>
    </DocumentBody>
  );
}

import { ArrowSquareOutIcon, CopyIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { Button, EmptyState, ExternalLink, Tooltip } from "@/components";
import { useCopyToClipboard } from "@/hooks";
import { errorSummary, m, Marked } from "@/i18n";
import type { AppError, AssetRef, WorkshopFileKind } from "@/lib/tauri";

import { describeFileKind } from "../utils/fileKindIcon";
import { useOpenInRitobin, useRitobinIntegration } from "./useRitobin";

/** The extension on the VS Code marketplace. */
const EXTENSION_URL = "https://marketplace.visualstudio.com/items?itemName=alanpq.ritobin-lsp-vs";

/** The install command as VS Code's palette lists it, category and all. */
const PALETTE_COMMAND = "ritobin-lsp: Install Windows Explorer Integration";

/** Whether a file kind is one the ritobin editor reads. */
export function isPropertyBin(kind: WorkshopFileKind): boolean {
  return kind === "property_bin" || kind === "property_bin_override";
}

interface BinPreviewProps {
  asset: AssetRef;
  /** The file name, which the document resolved. A reference may hold a hash. */
  name: string;
  /** Why the viewer could not parse the file, where it could not. */
  error?: AppError;
}

/**
 * A property bin the viewer does not draw, and the way out to something that reads one.
 *
 * VS Code reads one through the ritobin-lsp extension, which turns it into text on the
 * way in. This pane offers that handoff, and says what installs it when the handoff is
 * not there. A parse failure lands here with its error.
 */
export function BinPreview({ asset, name, error }: BinPreviewProps) {
  const integration = useRitobinIntegration();
  const action = <WayOut asset={asset} name={name} />;

  if (error) {
    return (
      <Pane>
        <EmptyState
          size="xs"
          icon={<BinGlyph />}
          title={m.workshop_bin_unreadable_title()}
          description={<span className="select-text">{errorSummary(error)}</span>}
          action={action}
        />
      </Pane>
    );
  }

  if (integration.data === false) {
    return (
      <Pane>
        <EmptyState
          size="xs"
          icon={<BinGlyph />}
          description={m.workshop_bin_unsupported_description()}
          action={action}
        />
      </Pane>
    );
  }

  return (
    <Pane>
      <EmptyState
        size="xs"
        icon={<BinGlyph />}
        title={m.workshop_bin_no_viewer_title()}
        description={m.workshop_bin_no_viewer_description()}
        action={action}
      />
    </Pane>
  );
}

/** The handoff, or what installs it on a machine without one. */
function WayOut({ asset, name }: Pick<BinPreviewProps, "asset" | "name">) {
  const integration = useRitobinIntegration();
  const open = useOpenInRitobin();

  if (integration.data === false) return <InstallSteps />;

  return (
    <Button
      size="xs"
      loading={open.isPending}
      left={<ArrowSquareOutIcon className="h-3.5 w-3.5" weight="bold" />}
      onClick={() => open.mutate({ asset, name })}
    >
      {m.workshop_bin_open_vscode_action()}
    </Button>
  );
}

function Pane({ children }: { children: ReactNode }) {
  return (
    <div
      data-ui="BinPreview"
      className="flex min-h-0 flex-1 flex-col justify-center bg-surface-950 select-none"
    >
      {children}
    </div>
  );
}

/** The mark the tree row carries, so the pane reads like the row that opened it. */
function BinGlyph() {
  const descriptor = describeFileKind("property_bin");
  const Icon = descriptor.icon;

  return (
    <span style={{ color: `var(${descriptor.tintToken})` }}>
      <Icon className="h-10 w-10" strokeWidth={1.5} />
    </span>
  );
}

/** What a machine without the handoff has left to do, in the order to do it. */
function InstallSteps() {
  const copy = useCopyToClipboard();

  return (
    <ol className="max-w-sm list-outside list-decimal pl-5 text-left text-xs leading-relaxed text-surface-400">
      <li>
        <Marked text={m.workshop_bin_install_extension_label()}>
          {(clause) => <ExternalLink href={EXTENSION_URL}>{clause}</ExternalLink>}
        </Marked>
      </li>
      <li>
        {m.workshop_bin_install_command_label()}
        <Tooltip content={m.workshop_bin_copy_command_action()}>
          <button
            type="button"
            onClick={() => void copy(PALETTE_COMMAND, m.workshop_bin_command_label())}
            className="mt-1 flex w-full items-center gap-1.5 rounded-sm bg-surface-800 px-1.5 py-1 text-left font-mono text-[0.6875rem] text-surface-200 transition-colors hover:bg-surface-700"
          >
            <span className="truncate">{PALETTE_COMMAND}</span>
            <CopyIcon className="ml-auto h-3 w-3 shrink-0 text-surface-400" />
          </button>
        </Tooltip>
      </li>
    </ol>
  );
}

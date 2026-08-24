import {
  AlertTriangle,
  Copy,
  FileWarning,
  type LucideIcon,
  Package,
  PackageX,
  ShieldAlert,
  Wrench,
} from "lucide-react";

import { AlertBox, Button, Dialog, Spinner, useToast } from "@/components";
import type { ScanStatus, WadScanFailedPayload } from "@/lib/tauri";

import { usePatcherStatus } from "../api/usePatcherStatus";
import { useStopPatcher } from "../api/useStopPatcher";
import { useWadScanFailure } from "../api/useWadScanFailure";
import { useWadScanOffenders } from "../api/useWadScanOffenders";

function pickPrimaryStatus(statuses: ScanStatus[]): ScanStatus {
  const unique = [...new Set(statuses)];
  if (unique.includes("skinhack")) return "skinhack";
  if (unique.length === 1) return unique[0] ?? "unknown";
  return "unknown";
}

interface StatusConfig {
  title: string;
  icon: LucideIcon;
  tone: "red" | "amber";
  lead: string;
  fix: string;
}

const STATUS_CONFIG: Record<ScanStatus, StatusConfig> = {
  skinhack: {
    title: "Skinhack detected",
    icon: ShieldAlert,
    tone: "red",
    lead: "The patcher's integrity scan detected a skinhack among your enabled mods. Using official Riot skins is not allowed.",
    fix: "Remove or disable the offending mod(s), then start the patcher again.",
  },
  "missing-bin": {
    title: "Missing Data File",
    icon: PackageX,
    tone: "amber",
    lead: "The patcher couldn't resolve a data file link.",
    fix: "Update the offending mod(s), then start the patcher again.",
  },
  corrupt: {
    title: "A mod file is corrupt",
    icon: PackageX,
    tone: "amber",
    lead: "A modded WAD couldn't be read (it's corrupt or built for an unsupported version).",
    fix: "Re-import the offending mod(s), then start the patcher again.",
  },
  "out-of-memory": {
    title: "Ran out of memory",
    icon: AlertTriangle,
    tone: "amber",
    lead: "The game ran out of memory while loading mods.",
    fix: "Close other programs or reduce the number of enabled mods, then try again.",
  },
  "base-skin": {
    title: "A mod is incomplete",
    icon: PackageX,
    tone: "amber",
    lead: "Found a character skin with a missing mesh.",
    fix: "Re-import or rebuild the offending mod(s), then start the patcher again.",
  },
  "base-wad": {
    title: "A game file is not what the scan expects",
    icon: FileWarning,
    tone: "amber",
    lead: "The content scan rejected a source Wad archive from the game.",
    fix: "Repair the install in the Riot Client, then start the patcher again.",
  },
  unknown: {
    title: "Mods could not be applied",
    icon: AlertTriangle,
    tone: "amber",
    lead: "A modded file failed the integrity scan.",
    fix: "Remove or re-import the offending mod(s), then start the patcher again.",
  },
};

const TONE = {
  red: {
    badge: "bg-danger/15 text-danger-text",
    wad: "bg-danger/10 text-danger-text",
    close: "text-danger-text hover:bg-danger/15 hover:text-danger-text",
  },
  amber: {
    badge: "bg-warning/15 text-warning-text",
    wad: "bg-warning/10 text-warning-text",
    close: "text-warning-text hover:bg-warning/15 hover:text-warning-text",
  },
};

/** Strip the WAD extension for a readable label, so `Ahri.wad.client` → `Ahri`. */
function wadLabel(wad: string): string {
  return wad.replace(/\.wad(\.client|\.server)?$/i, "");
}

export function WadScanFailedDialog() {
  const { failure, clear } = useWadScanFailure();

  if (!failure) return null;

  return <WadScanFailedContent failure={failure} onClose={clear} />;
}

function WadScanFailedContent({
  failure,
  onClose,
}: {
  failure: WadScanFailedPayload;
  onClose: () => void;
}) {
  const { data: patcherStatus } = usePatcherStatus();
  const stopPatcher = useStopPatcher();
  const toast = useToast();
  const { offenders, unmatchedWads, isLoading } = useWadScanOffenders(failure.failures);

  const statuses = failure.failures.map((f) => f.reading);
  const primaryStatus = pickPrimaryStatus(statuses);
  const config = STATUS_CONFIG[primaryStatus];
  const tone = TONE[config.tone];
  const Icon = config.icon;

  const offendersHeading =
    offenders.length === 1 ? "Offending mod" : `Offending mods (${offenders.length})`;
  const unmatchedLabel = offenders.length > 0 ? "Also flagged" : "Flagged files";

  const handleStop = () => {
    if (patcherStatus?.running) {
      stopPatcher.mutate(undefined, {
        onError: (error) => {
          // The injector may have already auto-stopped the thread by the time the
          // user clicks. A "not running" rejection here is a no-op, not a failure.
          console.error("Failed to stop patcher:", error.message);
        },
      });
    }
    onClose();
  };

  const handleCopyDetails = () => {
    const lines = [`LTK Manager - ${config.title}`];
    if (offenders.length > 0) {
      lines.push("Offending mods:");
      offenders.forEach((o) => lines.push(`  - ${o.displayName} (${o.wads.join(", ")})`));
    }
    if (unmatchedWads.length > 0) {
      lines.push(`Unmatched files: ${unmatchedWads.join(", ")}`);
    }
    const statuses = [...new Set(failure.failures.map((f) => f.status))];
    lines.push(`Status: ${statuses.join(", ")}`);

    navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => toast.success("Copied", "Details copied to clipboard"))
      .catch(() => toast.error("Copy failed", "Could not access the clipboard"));
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Overlay size="md">
          <Dialog.Header>
            <Dialog.Title className="flex items-center gap-2.5">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tone.badge}`}
              >
                <Icon className="h-4 w-4" />
              </span>
              {config.title}
            </Dialog.Title>
            <Dialog.Close className={tone.close} />
          </Dialog.Header>

          <Dialog.Body className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-surface-300">{config.lead}</p>

            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-surface-400">
                <Spinner size="sm" />
                Identifying the responsible mods…
              </div>
            )}

            {!isLoading && offenders.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium tracking-wide text-surface-400 uppercase">
                  {offendersHeading}
                </p>
                <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
                  {offenders.map((offender) => (
                    <div
                      key={offender.modId}
                      className="flex items-center justify-between gap-3 rounded-md bg-surface-900 px-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <Package className="h-4 w-4 shrink-0 text-surface-400" />
                        <span className="truncate text-sm font-medium text-surface-100">
                          {offender.displayName}
                        </span>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1">
                        {offender.wads.map((wad) => (
                          <span
                            key={wad}
                            title={wad}
                            className={`rounded px-1.5 py-0.5 text-xs font-medium ${tone.wad}`}
                          >
                            {wadLabel(wad)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!isLoading && unmatchedWads.length > 0 && (
              <p className="text-xs text-surface-500">
                {unmatchedLabel} (no matching enabled mod):{" "}
                <span className="font-mono text-surface-400">{unmatchedWads.join(", ")}</span>
              </p>
            )}

            <AlertBox variant="warning" icon={<Wrench className="h-5 w-5" />} title={config.fix} />
          </Dialog.Body>

          <Dialog.Footer>
            <Button
              variant="ghost"
              className="mr-auto whitespace-nowrap text-surface-400"
              left={<Copy className="h-4 w-4" />}
              onClick={handleCopyDetails}
            >
              Copy details
            </Button>
            <Button
              variant="filled"
              className="whitespace-nowrap"
              loading={stopPatcher.isPending}
              onClick={handleStop}
            >
              Ok, Stop Patcher
            </Button>
          </Dialog.Footer>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

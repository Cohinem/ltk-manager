import { ArrowClockwiseIcon, CheckCircleIcon, InfoIcon, XCircleIcon } from "@phosphor-icons/react";

import { m } from "@/i18n";
import type { BulkInstallResult } from "@/lib/tauri";

interface BulkInstallResultsProps {
  result: BulkInstallResult;
  /** Verb used in the success message. */
  verb?: "installed" | "imported";
}

export function BulkInstallResults({ result, verb = "installed" }: BulkInstallResultsProps) {
  const succeededLabel =
    verb === "imported"
      ? m.library_import_results_imported_label
      : m.library_import_results_installed_label;

  return (
    <div className="flex flex-col gap-3">
      {result.installed.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-success-text">
          <CheckCircleIcon weight="duotone" className="size-4 shrink-0" />
          <span>{succeededLabel({ count: result.installed.length })}</span>
        </div>
      )}

      {result.updated.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-success-text">
            <ArrowClockwiseIcon weight="duotone" className="size-4 shrink-0" />
            <span>{m.library_import_results_updated_label({ count: result.updated.length })}</span>
          </div>
          <ul className="flex flex-col gap-1 pl-6">
            {result.updated.map((mod) => (
              <li key={mod.id} className="text-sm text-surface-300">
                {mod.displayName} <span className="text-surface-400">{mod.version}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.alreadyInstalled.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-info-text">
            <InfoIcon weight="duotone" className="size-4 shrink-0" />
            <span>
              {m.library_import_results_existing_label({ count: result.alreadyInstalled.length })}
            </span>
          </div>
          <ul className="flex flex-col gap-1 pl-6">
            {result.alreadyInstalled.map((mod, index) => (
              <li key={`${mod.id}-${index}`} className="text-sm text-surface-300">
                {mod.displayName}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.failed.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-danger-text">
            <XCircleIcon weight="duotone" className="size-4 shrink-0" />
            <span>{m.library_import_results_failed_label({ count: result.failed.length })}</span>
          </div>
          <ul className="flex flex-col gap-1 pl-6">
            {result.failed.map((err) => (
              <li key={err.filePath} className="text-sm text-surface-400">
                <span className="font-medium text-surface-300">{err.fileName}</span>
                {" - "}
                {err.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

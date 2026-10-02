import { WarningCircleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { describeError, m } from "@/i18n";
import type { AppError } from "@/lib/tauri";
import { twMerge } from "@/utils";

export type ErrorStateTone = "danger" | "warning";

const TONE_CLASSES: Record<ErrorStateTone, string> = {
  danger: "bg-danger/10 text-danger-text",
  warning: "bg-warning/10 text-warning-text",
};

export interface ErrorStateProps {
  readonly error: AppError;
  /** What failed. Without it the error's own title leads. */
  readonly title?: ReactNode;
  readonly tone?: ErrorStateTone;
  /** The error's code is written under its copy, for a report. */
  readonly showCode?: boolean;
  readonly action?: ReactNode;
  readonly className?: string;
}

/** What a view shows in place of content it could not load, from the backend's error. */
export function ErrorState({
  error,
  title,
  tone = "danger",
  showCode = true,
  action,
  className,
}: ErrorStateProps) {
  const copy = describeError(error);
  const summary = title === undefined ? copy.description : copy.title;

  return (
    <div
      data-ui="ErrorState"
      className={twMerge("flex h-64 flex-col items-center justify-center text-center", className)}
    >
      <div className={twMerge("mb-4 rounded-full p-4", TONE_CLASSES[tone])}>
        <WarningCircleIcon weight="bold" className="size-8" />
      </div>
      <h3 className="mb-1 text-lg font-medium text-surface-300">{title ?? copy.title}</h3>
      {summary !== undefined && <p className="mb-2 max-w-md text-surface-500">{summary}</p>}
      {copy.detail !== undefined && (
        <p className="mb-2 max-w-md text-surface-500 select-text">{copy.detail}</p>
      )}
      {showCode && (
        <p className="text-sm text-surface-600 select-text">
          {m.common_error_code_label({ code: error.code })}
        </p>
      )}
      {action && <div className="mt-4 flex gap-3">{action}</div>}
    </div>
  );
}

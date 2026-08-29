import { useNavigate } from "@tanstack/react-router";

import { useToast } from "@/components";
import type { AppError, OverlayErrorCategory, PatcherError } from "@/lib/tauri";
import { useTauriEvent } from "@/lib/useTauriEvent";
import { type PatcherFailure, type PatcherFailureStage, usePatcherFailureStore } from "@/stores";
import { getOverlayErrorCategory } from "@/utils/errors";

type InjectionFailed = Extract<PatcherError, { kind: "INJECTION_FAILED" }>;

const failureTitles: Record<PatcherFailureStage, string> = {
  BUILD: "Overlay Build Failure",
  HOST: "Injection Host Failure",
  INJECTION: "DLL Injection Failure",
};

/** The failed-start line's title for a stage, in the words the verdict uses. */
export function patcherFailureTitle(stage: PatcherFailureStage): string {
  return failureTitles[stage];
}

/**
 * Which Diagnostics tab answers a stage.
 *
 * A host that did not start is what the System checks look for: antivirus, a
 * declined UAC prompt, a missing binary. Anything later is the incident's.
 */
export function patcherFailureTab(stage: PatcherFailureStage): "games" | "system" {
  return stage === "HOST" ? "system" : "games";
}

function isInjectionFailed(context: unknown): context is InjectionFailed {
  return (
    typeof context === "object" &&
    context !== null &&
    "kind" in context &&
    context.kind === "INJECTION_FAILED"
  );
}

/**
 * The start failure a `patcher-error` carries, or `null` when it failed nothing.
 *
 * The thread reports on this event from two places only. The session sends
 * `InjectionFailed` with its stage, and the overlay build sends the builder's
 * own error as it is, under whatever code the builder raised. A `PATCHER` error
 * of any other kind is a refusal such as `BUSY`, which no start failed on.
 */
export function classifyPatcherError(error: AppError): PatcherFailure | null {
  if (isInjectionFailed(error.context)) {
    return { stage: error.context.stage, message: error.context.message };
  }
  if (error.code === "PATCHER") return null;
  return { stage: "BUILD", message: error.message };
}

/** Toast titles per overlay failure category, each naming what to go fix. */
const overlayFailureTitles: Record<OverlayErrorCategory, string> = {
  GAME_DIR: "Game Install Problem",
  MOD_CONTENT: "Mod Content Problem",
  WAD_LIMIT: "Mod Too Large",
  CORRUPT: "Corrupt Game Files",
  BUG: "Overlay Builder Bug",
  OTHER: "Overlay Build Failure",
};

/**
 * The toast title for a failed build, by what actually failed.
 *
 * An overlay failure names its category so a wrong game dir does not read as
 * a broken mod. Anything else keeps the generic title.
 */
export function buildFailureTitle(error: AppError): string {
  const category = getOverlayErrorCategory(error);
  return category ? overlayFailureTitles[category] : "Patcher Error";
}

/**
 * Every `patcher-error`, as a toast and the session bar's failed-start line.
 *
 * Mounted once at the root, so a failure during a workshop test or under the
 * settings page reaches the user the same as one on the Library.
 */
export function usePatcherError() {
  const toast = useToast();
  const navigate = useNavigate();
  const setFailure = usePatcherFailureStore((s) => s.set);

  useTauriEvent<AppError>("patcher-error", (error) => {
    const failure = classifyPatcherError(error);
    if (failure) setFailure(failure);

    if (!failure || failure.stage === "BUILD") {
      toast.error(buildFailureTitle(error), error.message, { notify: true });
      return;
    }

    const tab = patcherFailureTab(failure.stage);
    toast.toast({
      type: "error",
      title: patcherFailureTitle(failure.stage),
      description: failure.message,
      timeout: 7000,
      notify: true,
      action: {
        label: tab === "system" ? "Diagnostics" : "Details",
        onClick: () => navigate({ to: "/diagnostics", search: { tab } }),
      },
    });
  });
}

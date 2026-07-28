import { useCallback } from "react";

import { useToast } from "@/components";
import { useHddWarning } from "@/hooks";
import { api, type AppError, isOk, type LaunchOutcome } from "@/lib/tauri";
import { useGuardedStartPatcher } from "@/modules/patcher";
import { type PlayStep, usePlaySessionStore } from "@/stores";

import { useLaunchErrorToast } from "./useLaunchErrorToast";
import { useLaunchLeague } from "./useLaunchLeague";

/** How long `start_patcher` gets to move the phase off idle at all. */
const STARTUP_TIMEOUT_MS = 10_000;
/** How long the overlay build itself may take - a first build on an HDD is minutes. */
const BUILD_TIMEOUT_MS = 30 * 60_000;
const POLL_INTERVAL_MS = 500;

export type { PlayStep };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait until the patcher is up and waiting for the game.
 *
 * `start_patcher` returns as soon as its background thread is spawned, so
 * watching the phase is the only way to know the overlay finished building.
 * Two budgets rather than one: a short one for the thread to pick the work up
 * at all, then a long one once it has. A start that was refused never leaves
 * idle, and making that case wait out the full build timeout would read as a
 * hang.
 */
async function waitForPatcher(): Promise<boolean> {
  const startupDeadline = Date.now() + STARTUP_TIMEOUT_MS;
  let buildDeadline: number | null = null;

  for (;;) {
    const result = await api.getPatcherStatus();
    if (isOk(result)) {
      const { phase } = result.value;
      if (phase === "patching") return true;
      if (phase === "building" && buildDeadline === null) {
        buildDeadline = Date.now() + BUILD_TIMEOUT_MS;
      }
      // Idle after the build had started means it failed or was stopped;
      // `usePatcherError` has already surfaced the reason.
      if (phase === "idle" && buildDeadline !== null) return false;
    }

    if (Date.now() > (buildDeadline ?? startupDeadline)) return false;
    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * The composed "Play" action: build the overlay, wait for the patcher to come
 * up, then ask the Riot Client to launch League.
 *
 * Sequenced here rather than in one backend command on purpose. The two halves
 * fail independently and are independently useful - launching without mods,
 * patching for a client the user started themselves - so they stay two
 * commands and this hook owns the ordering.
 *
 * That second case is also why a running League client is not an error: mods
 * are injected into the game process, which the client starts later, so the
 * patcher half still does its job when the launch half has nothing left to do.
 */
export function usePlay() {
  const maybeShowHddWarning = useHddWarning();
  const { start } = useGuardedStartPatcher();
  const launchLeague = useLaunchLeague();
  const showLaunchError = useLaunchErrorToast();
  const toast = useToast();

  const step = usePlaySessionStore((s) => s.step);
  const setStep = usePlaySessionStore((s) => s.setStep);

  const launch = useCallback(async (): Promise<LaunchOutcome | null> => {
    try {
      return await launchLeague.mutateAsync(undefined);
    } catch (error) {
      showLaunchError(error as AppError);
      return null;
    }
  }, [launchLeague, showLaunchError]);

  // Read through the store rather than the subscribed value: two clicks in the
  // same tick would both see a stale `step` from the render they closed over.
  const isIdle = () => usePlaySessionStore.getState().step === "idle";

  const play = useCallback(async () => {
    if (!isIdle()) return;
    setStep("starting-patcher");

    try {
      await maybeShowHddWarning();
      await start({});
      if (!(await waitForPatcher())) return;

      setStep("launching");
      await launch();
    } finally {
      setStep("idle");
    }
  }, [maybeShowHddWarning, start, launch, setStep]);

  const launchOnly = useCallback(async () => {
    if (!isIdle()) return;
    setStep("launching");

    try {
      const outcome = await launch();
      if (outcome?.route === "ALREADY_RUNNING") {
        toast.info(
          "League is already running",
          "There was nothing to launch, so your open client was left alone.",
        );
      }
    } finally {
      setStep("idle");
    }
  }, [launch, setStep, toast]);

  return { play, launchOnly, step, isBusy: step !== "idle" };
}

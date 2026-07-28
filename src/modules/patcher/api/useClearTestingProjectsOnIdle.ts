import { useEffect, useRef } from "react";

import { usePatcherSessionStore } from "@/stores";

import { usePatcherStatus } from "./usePatcherStatus";

/**
 * Reset the workshop testing session once the patcher goes idle.
 *
 * Must be mounted for the whole app lifetime, not just where the session is
 * displayed: the patcher can be stopped from any page, and leaving
 * `testingProjects` populated would strand the workshop in a pending-test state.
 */
export function useClearTestingProjectsOnIdle() {
  const { data: status } = usePatcherStatus();
  const testingProjects = usePatcherSessionStore((s) => s.testingProjects);
  const clearTestingProjects = usePatcherSessionStore((s) => s.clearTestingProjects);

  const isIdle = !(status?.running ?? false) && status?.phase !== "building";

  const wasActiveRef = useRef(false);
  useEffect(() => {
    if (!isIdle) {
      wasActiveRef.current = true;
    } else if (wasActiveRef.current && testingProjects.length > 0) {
      clearTestingProjects();
      wasActiveRef.current = false;
    }
  }, [isIdle, testingProjects, clearTestingProjects]);
}

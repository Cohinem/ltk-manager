import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useUpdaterStore } from "@/stores";

import { useUpdateCheck } from "../useUpdateCheck";

describe("useUpdateCheck", () => {
  beforeEach(() => {
    useUpdaterStore.setState({ update: null, dialogOpen: false });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /* Vitest loads .env.local like any dev run, so the flag is stubbed either
     way rather than inherited from whoever is running the suite. */
  it("offers a dev run nothing to update to", () => {
    vi.stubEnv("VITE_MOCK_UPDATE", "");

    renderHook(() => useUpdateCheck());

    expect(useUpdaterStore.getState().update).toBeNull();
  });

  it("seeds the stand-in update behind the flag, and leaves the dialog closed", () => {
    vi.stubEnv("VITE_MOCK_UPDATE", "1");

    renderHook(() => useUpdateCheck());

    const { update, dialogOpen } = useUpdaterStore.getState();
    expect(update?.version).toBe("99.0.0");
    expect(dialogOpen).toBe(false);
  });
});

// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { InstalledMod } from "@/lib/tauri";
import { createMockInstalledMod } from "@/test/fixtures";
import { mockInvoke } from "@/test/mocks/tauri";

import { libraryKeys } from "../keys";
import { useSetModStorage } from "../useSetModStorage";

/* What the cache holds afterwards is the subject here, and the shared helper's
   `gcTime: 0` collects a query nothing is observing. In the app the library
   list observes this one for as long as it is on screen. */
function mount(cached: InstalledMod[] = []) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  queryClient.setQueryData(libraryKeys.mods(), cached);

  return {
    queryClient,
    ...renderHook(() => useSetModStorage(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useSetModStorage", () => {
  it("asks the backend for the storage the card picked", async () => {
    const updated = createMockInstalledMod({ storage: "archive" });
    mockInvoke.mockResolvedValue({ ok: true, value: updated });

    const { result } = mount([createMockInstalledMod()]);
    result.current.mutate({ modId: "test-mod-id", storage: "archive" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockInvoke).toHaveBeenCalledWith("set_mod_storage", {
      modId: "test-mod-id",
      storage: "archive",
    });
  });

  /* The card reads its state off the list, so writing the returned mod back is
     what turns the menu's tick over without waiting for a refetch. */
  it("replaces the converted mod in the list and leaves the rest alone", async () => {
    const other = createMockInstalledMod({ id: "other-mod", displayName: "Other Mod" });
    const updated = createMockInstalledMod({ storage: "archive" });
    mockInvoke.mockResolvedValue({ ok: true, value: updated });

    const { queryClient, result } = mount([createMockInstalledMod(), other]);
    result.current.mutate({ modId: "test-mod-id", storage: "archive" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData<InstalledMod[]>(libraryKeys.mods())).toEqual([updated, other]);
  });

  /* The conversion rewrote the tree the overlay reads, so a scan cached against
     the old one describes a directory that is gone. */
  it("drops the cached scan of the tree it replaced", async () => {
    mockInvoke.mockResolvedValue({ ok: true, value: createMockInstalledMod() });

    const { queryClient, result } = mount();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    result.current.mutate({ modId: "test-mod-id", storage: "project" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: libraryKeys.mods() });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: libraryKeys.wadReport("test-mod-id"),
    });
  });

  /* A refused conversion is the one path that carries a reason the user has to
     read, so it has to reach the caller rather than being swallowed. */
  it("hands a refusal back to whoever asked", async () => {
    mockInvoke.mockResolvedValue({
      ok: false,
      error: { kind: "validationFailed", message: "This mod is in a failed state." },
    });

    const { result } = mount([createMockInstalledMod()]);
    result.current.mutate({ modId: "test-mod-id", storage: "archive" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({
      kind: "validationFailed",
      message: "This mod is in a failed state.",
    });
  });

  /* The mod is still whatever it was, and showing it as converted would be a
     lie the next refetch corrects. */
  it("leaves the list untouched when the conversion is refused", async () => {
    const before = createMockInstalledMod();
    mockInvoke.mockResolvedValue({
      ok: false,
      error: { kind: "validationFailed", message: "nope" },
    });

    const { queryClient, result } = mount([before]);
    result.current.mutate({ modId: "test-mod-id", storage: "archive" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData<InstalledMod[]>(libraryKeys.mods())).toEqual([before]);
  });
});

// @vitest-environment happy-dom

import { QueryClientProvider, queryOptions } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { AppError, SearchHits, IndexResponse } from "@/lib/tauri";
import { createTestQueryClient } from "@/test/utils";

import {
  liveSearchOptions,
  readyValue,
  supersededResponse,
  supersededScan,
  useLiveSearch,
} from "../indexQueries";

function scan(hits: number[], superseded = false): SearchHits<number> {
  return { hits, total: hits.length, superseded, unnamed: false };
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
}

describe("useLiveSearch", () => {
  it("keeps the last whole answer over a superseded one, and asks again", async () => {
    const answers: Record<string, SearchHits<number>[]> = {
      a: [scan([1])],
      b: [scan([], true), scan([2])],
    };
    const fetch = vi.fn(async (input: string) => answers[input]!.shift()!);
    const options = (input: string) =>
      queryOptions<SearchHits<number>, AppError>({
        queryKey: ["live", input],
        queryFn: () => fetch(input),
        ...liveSearchOptions(supersededScan),
      });

    const { result, rerender } = renderHook(
      ({ input }) => useLiveSearch(input, 0, options, supersededScan),
      { wrapper, initialProps: { input: "a" } },
    );
    await waitFor(() => expect(result.current.data?.hits).toEqual([1]));

    rerender({ input: "b" });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("b"));
    expect(result.current.data?.hits).toEqual([1]);

    await waitFor(() => expect(result.current.data?.hits).toEqual([2]), { timeout: 3000 });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});

describe("index answers", () => {
  it("reads the value of a ready answer only", () => {
    const ready: IndexResponse<number> = { status: "ready", value: 4 };
    expect(readyValue(ready)).toBe(4);
    expect(readyValue<number>({ status: "building" })).toBeUndefined();
    expect(readyValue<number>(undefined)).toBeUndefined();
  });

  it("finds the superseded scan inside a ready answer", () => {
    expect(supersededResponse({ status: "ready", value: scan([], true) })).toBe(true);
    expect(supersededResponse({ status: "ready", value: scan([1]) })).toBe(false);
    expect(supersededResponse({ status: "absent" })).toBe(false);
  });
});

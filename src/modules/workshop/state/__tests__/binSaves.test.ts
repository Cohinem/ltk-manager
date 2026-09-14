// @vitest-environment happy-dom

import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BinDocumentId } from "@/lib/tauri";
import { mockInvoke } from "@/test/mocks/tauri";

import {
  flushBinSave,
  forgetBinSave,
  isQueuedThrough,
  queueForSave,
  retryBinSave,
  useBinSave,
} from "../binSaves";

const ASSET = "layer:C:/mods/skin:base:data/skin0.bin";
const DOCUMENT = 7 as BinDocumentId;

function state() {
  return renderHook(() => useBinSave(ASSET)).result.current.state;
}

beforeEach(() => {
  vi.useFakeTimers();
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue({ ok: true, value: null });
});

afterEach(() => {
  forgetBinSave(ASSET);
  vi.useRealTimers();
});

describe("the bin save queue", () => {
  it("saves once after the wait, however many patches queued it", async () => {
    queueForSave(ASSET, DOCUMENT);
    queueForSave(ASSET, DOCUMENT);
    expect(state()).toBe("pending");
    expect(isQueuedThrough(ASSET, DOCUMENT)).toBe(true);

    await vi.advanceTimersByTimeAsync(600);

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith("bin_save", { document: DOCUMENT });
    expect(state()).toBe("clean");
    expect(isQueuedThrough(ASSET, DOCUMENT)).toBe(false);
  });

  it("writes at once on a flush, and nothing when no save is queued", async () => {
    await flushBinSave(ASSET);
    expect(mockInvoke).not.toHaveBeenCalled();

    queueForSave(ASSET, DOCUMENT);
    await flushBinSave(ASSET);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("reads failed on a refusal, and a retry queues the save again", async () => {
    mockInvoke.mockResolvedValueOnce({ ok: false, error: { code: "BIN_CHANGED_ON_DISK" } });
    queueForSave(ASSET, DOCUMENT);
    await flushBinSave(ASSET);

    const { result } = renderHook(() => useBinSave(ASSET));
    expect(result.current).toEqual({ state: "failed", error: { code: "BIN_CHANGED_ON_DISK" } });

    retryBinSave(ASSET);
    expect(state()).toBe("pending");
    await vi.advanceTimersByTimeAsync(600);
    expect(state()).toBe("clean");
  });

  it("keeps a patch that landed during the write pending", async () => {
    let answer: (value: unknown) => void = () => {};
    mockInvoke.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    queueForSave(ASSET, DOCUMENT);
    const writing = flushBinSave(ASSET);
    expect(state()).toBe("saving");

    queueForSave(ASSET, DOCUMENT);
    answer({ ok: true, value: null });
    await writing;

    expect(state()).toBe("pending");
  });
});

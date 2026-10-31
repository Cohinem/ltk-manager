// @vitest-environment happy-dom

import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  documentSave,
  flushDocumentSaves,
  lendDocumentSave,
  useDocumentFlush,
} from "../state/documentSaves";

afterEach(cleanup);

describe("lendDocumentSave", () => {
  it("writes the document's save and the lent save once each on a requested save", async () => {
    const own = vi.fn(() => Promise.resolve());
    const lent = vi.fn(() => Promise.resolve());
    renderHook(() => useDocumentFlush("tab", own));
    const withdraw = lendDocumentSave("tab", lent);

    await documentSave("tab")?.();

    expect(own).toHaveBeenCalledTimes(1);
    expect(lent).toHaveBeenCalledTimes(1);

    withdraw();
  });

  it("leaves the lent save out of a quit's flush", async () => {
    const own = vi.fn(() => Promise.resolve());
    const lent = vi.fn(() => Promise.resolve());
    renderHook(() => useDocumentFlush("tab", own));
    const withdraw = lendDocumentSave("tab", lent);

    await flushDocumentSaves();

    expect(own).toHaveBeenCalledTimes(1);
    expect(lent).not.toHaveBeenCalled();

    withdraw();
  });

  it("returns a save for a document that offers only a lent one", async () => {
    const lent = vi.fn(() => Promise.resolve());
    const withdraw = lendDocumentSave("file", lent);

    await documentSave("file")?.();

    expect(lent).toHaveBeenCalledTimes(1);

    withdraw();
    expect(documentSave("file")).toBeNull();
  });
});

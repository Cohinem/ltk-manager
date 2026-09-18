// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";

import { findMatches, useTextFind } from "../useTextFind";

const TEXT = "Alpha beta\nAlpha gamma\nalpha delta";

describe("findMatches", () => {
  it("finds every occurrence, whatever its case", () => {
    expect(findMatches(TEXT, "alpha")).toEqual([
      { start: 0, end: 5 },
      { start: 11, end: 16 },
      { start: 23, end: 28 },
    ]);
  });

  it("finds nothing for an empty query", () => {
    expect(findMatches(TEXT, "")).toEqual([]);
  });

  it("finds nothing for a query the text does not hold", () => {
    expect(findMatches(TEXT, "epsilon")).toEqual([]);
  });

  /* Non-overlapping, so a count reads as the number of places to go to. */
  it("does not overlap one match with the next", () => {
    expect(findMatches("aaa", "aa")).toEqual([{ start: 0, end: 2 }]);
  });
});

describe("useTextFind", () => {
  it("opens on a reveal and closes again", () => {
    const { result } = renderHook(() => useTextFind(TEXT));
    expect(result.current.open).toBe(false);

    act(() => result.current.reveal());
    expect(result.current.open).toBe(true);

    act(() => result.current.close());
    expect(result.current.open).toBe(false);
  });

  it("sits on the first match of a fresh query", () => {
    const { result } = renderHook(() => useTextFind(TEXT));

    act(() => result.current.setQuery("alpha"));

    expect(result.current.matches).toHaveLength(3);
    expect(result.current.index).toBe(0);
  });

  it("wraps at the end and at the start", () => {
    const { result } = renderHook(() => useTextFind(TEXT));
    act(() => result.current.setQuery("alpha"));

    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current.index).toBe(2);

    act(() => result.current.next());
    expect(result.current.index).toBe(0);

    act(() => result.current.previous());
    expect(result.current.index).toBe(2);
  });

  it("reads no match at all for a query nothing answers", () => {
    const { result } = renderHook(() => useTextFind(TEXT));

    act(() => result.current.setQuery("epsilon"));

    expect(result.current.matches).toEqual([]);
    expect(result.current.index).toBe(-1);

    act(() => result.current.next());
    expect(result.current.index).toBe(-1);
  });

  it("keeps the query through a close", () => {
    const { result } = renderHook(() => useTextFind(TEXT));

    act(() => result.current.setQuery("beta"));
    act(() => result.current.close());
    act(() => result.current.reveal());

    expect(result.current.query).toBe("beta");
  });

  /* An edit can leave fewer matches than the mark stood on. */
  it("falls back to the first match when the text loses the one it was on", () => {
    const { result, rerender } = renderHook(({ text }) => useTextFind(text), {
      initialProps: { text: TEXT },
    });
    act(() => result.current.setQuery("alpha"));
    act(() => result.current.next());
    expect(result.current.index).toBe(1);

    rerender({ text: "Alpha only" });

    expect(result.current.matches).toHaveLength(1);
    expect(result.current.index).toBe(0);
  });
});

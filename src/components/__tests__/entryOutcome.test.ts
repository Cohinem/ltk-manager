import { describe, expect, it } from "vitest";

import { entryOutcome, parseNumberText } from "../entryOutcome";

describe("parseNumberText", () => {
  it("reads a number with the unit typed after it, in any case", () => {
    expect(parseNumberText("-3 dB", "dB")).toBe(-3);
    expect(parseNumberText("+120cents", "cents")).toBe(120);
    expect(parseNumberText(" 4.5 DB ", "dB")).toBe(4.5);
  });

  it("returns null for an empty text, a bare unit and a word", () => {
    expect(parseNumberText("", "dB")).toBeNull();
    expect(parseNumberText("dB", "dB")).toBeNull();
    expect(parseNumberText("loud", "dB")).toBeNull();
  });
});

const parse = (text: string) => parseNumberText(text, "dB");

describe("entryOutcome", () => {
  it("commits the typed value on Enter", () => {
    expect(entryOutcome("enter", { text: "-6 dB", initial: "-3 dB" }, parse)).toEqual({
      kind: "commit",
      value: -6,
    });
  });

  it("commits the typed value on a press outside", () => {
    expect(entryOutcome("outside", { text: "2", initial: "-3 dB" }, parse)).toEqual({
      kind: "commit",
      value: 2,
    });
  });

  it("cancels on Escape, whatever the text holds", () => {
    expect(entryOutcome("escape", { text: "-6 dB", initial: "-3 dB" }, parse)).toEqual({
      kind: "cancel",
    });
  });

  it("cancels a text left as it opened, so a rounded prefill does not write", () => {
    expect(entryOutcome("enter", { text: "-3 dB", initial: "-3 dB" }, parse)).toEqual({
      kind: "cancel",
    });
  });

  it("stays open on Enter if the text holds no number", () => {
    expect(entryOutcome("enter", { text: "loud", initial: "-3 dB" }, parse)).toEqual({
      kind: "invalid",
    });
  });

  it("cancels on a press outside if the text holds no number", () => {
    expect(entryOutcome("outside", { text: "loud", initial: "-3 dB" }, parse)).toEqual({
      kind: "cancel",
    });
  });
});

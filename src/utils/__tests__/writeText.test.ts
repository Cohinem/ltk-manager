// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { writeText } from "../writeText";

describe("writeText", () => {
  it("changes the one text node in place, with no child-list change", async () => {
    const label = document.createElement("span");
    label.textContent = "0.10";
    const node = label.firstChild;
    const changes: MutationRecord[] = [];
    const observer = new MutationObserver((records) => changes.push(...records));
    observer.observe(label, { childList: true, characterData: true, subtree: true });

    writeText(label, "0.20");
    await Promise.resolve();
    observer.disconnect();

    expect(label.textContent).toBe("0.20");
    expect(label.firstChild).toBe(node);
    expect(changes.map((change) => change.type)).toEqual(["characterData"]);
  });

  it("writes nothing where the text is the same", async () => {
    const label = document.createElement("span");
    label.textContent = "7";
    const changes: MutationRecord[] = [];
    const observer = new MutationObserver((records) => changes.push(...records));
    observer.observe(label, { childList: true, characterData: true, subtree: true });

    writeText(label, "7");
    await Promise.resolve();
    observer.disconnect();

    expect(changes).toEqual([]);
  });

  it("sets the text of an element that holds no single text node", () => {
    const empty = document.createElement("span");
    writeText(empty, "first");
    expect(empty.textContent).toBe("first");

    const mixed = document.createElement("span");
    mixed.append("a", document.createElement("b"));
    writeText(mixed, "only");
    expect(mixed.childNodes).toHaveLength(1);
    expect(mixed.textContent).toBe("only");
  });
});

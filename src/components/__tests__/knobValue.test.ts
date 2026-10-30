import { describe, expect, it } from "vitest";

import {
  continueGesture,
  draggedValue,
  gestureCommit,
  isResetPress,
  keyedValue,
  knobKeyAction,
  wheeledValue,
} from "../knobValue";

const VOLUME = { min: -96, max: 12, step: 0.5 };
const LPF = { min: 0, max: 100, step: 1 };

describe("draggedValue", () => {
  it("raises the value on an upward drag", () => {
    expect(draggedValue(-48, -50, VOLUME, false)).toBe(-21);
  });

  it("holds the value at the maximum past the end of the range", () => {
    expect(draggedValue(0, -400, VOLUME, false)).toBe(12);
  });

  it("turns a tenth as far when the drag is fine", () => {
    expect(draggedValue(-48, -50, VOLUME, true)).toBe(-45.3);
  });

  it("rounds to a whole step", () => {
    expect(draggedValue(0, 1, LPF, false)).toBe(0);
    expect(draggedValue(0, -3, LPF, false)).toBe(2);
  });
});

describe("keyedValue", () => {
  it("steps up on ArrowUp and ArrowRight", () => {
    expect(keyedValue(40, "ArrowUp", LPF, false)).toBe(41);
    expect(keyedValue(40, "ArrowRight", LPF, false)).toBe(41);
  });

  it("steps down by a tenth of a step with Shift held", () => {
    expect(keyedValue(40, "ArrowDown", LPF, true)).toBe(39.9);
  });

  it("takes a tenth of the range on Page Up and Page Down", () => {
    expect(keyedValue(40, "PageUp", LPF, false)).toBe(50);
    expect(keyedValue(-48, "PageDown", VOLUME, false)).toBe(-59);
  });

  it("goes to the bounds on Home and End", () => {
    expect(keyedValue(40, "Home", LPF, false)).toBe(0);
    expect(keyedValue(40, "End", LPF, false)).toBe(100);
  });

  it("holds the value inside the bounds", () => {
    expect(keyedValue(100, "ArrowUp", LPF, false)).toBe(100);
    expect(keyedValue(95, "PageUp", LPF, false)).toBe(100);
  });

  it("returns null for a key that does not step", () => {
    expect(keyedValue(40, "a", LPF, false)).toBeNull();
  });
});

describe("gestureCommit", () => {
  it("commits the last value of a run of changes once", () => {
    let gesture = continueGesture(null, 40, 41);
    gesture = continueGesture(gesture, 41, 42);
    gesture = continueGesture(gesture, 42, 43);

    expect(gestureCommit(gesture)).toBe(43);
  });

  it("commits nothing for a run that ends where it started", () => {
    let gesture = continueGesture(null, 40, 41);
    gesture = continueGesture(gesture, 41, 40);

    expect(gestureCommit(gesture)).toBeNull();
  });

  it("commits nothing without a gesture", () => {
    expect(gestureCommit(null)).toBeNull();
  });
});

describe("isResetPress", () => {
  it("resets on a primary press with Alt held", () => {
    expect(isResetPress({ button: 0, altKey: true })).toBe(true);
  });

  it("leaves a plain press and an Alt press of another button to the drag", () => {
    expect(isResetPress({ button: 0, altKey: false })).toBe(false);
    expect(isResetPress({ button: 2, altKey: true })).toBe(false);
  });
});

describe("knobKeyAction", () => {
  const plain = { altKey: false, ctrlKey: false, metaKey: false };

  it("resets on Delete and Backspace", () => {
    expect(knobKeyAction("Delete", plain)).toBe("reset");
    expect(knobKeyAction("Backspace", plain)).toBe("reset");
  });

  it("opens the value entry on F2 and Enter", () => {
    expect(knobKeyAction("F2", plain)).toBe("entry");
    expect(knobKeyAction("Enter", plain)).toBe("entry");
  });

  it("returns null for a chord and for a key that steps", () => {
    expect(knobKeyAction("Enter", { ...plain, ctrlKey: true })).toBeNull();
    expect(knobKeyAction("ArrowUp", plain)).toBeNull();
  });
});

describe("wheeledValue", () => {
  it("steps up on a wheel turned away from the reader", () => {
    expect(wheeledValue(40, -120, LPF, false)).toBe(41);
    expect(wheeledValue(40, 3, LPF, false)).toBe(39);
  });
});

// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TimelineMarkerList } from "../../hooks/useTimelineMarkers";
import type { TimeSnap } from "../../hooks/useTimeSnap";
import type { TimelineMarker } from "../../utils/markers";
import { MarkerRuler } from "../Markers";

const VIEW = { from: 0, to: 10 };
const WIDTH = 100;
const IMPACT: TimelineMarker = { id: "impact", time: 2, name: "impact" };

/** A snap that lands every time on the whole second nearest it, where the test can read it. */
const snap: TimeSnap = (time) => ({ time: Math.round(time), snapped: Math.round(time) });

function ruler(markers: readonly TimelineMarker[] = [IMPACT]) {
  const list: TimelineMarkerList = {
    markers,
    add: vi.fn(),
    move: vi.fn(),
    rename: vi.fn(),
    remove: vi.fn(),
    restore: vi.fn(),
  };
  const onSeek = vi.fn();
  render(
    <MarkerRuler view={VIEW} width={WIDTH} snap={snap} markers={list} onSeek={onSeek}>
      <div />
    </MarkerRuler>,
  );
  return { list, onSeek, flag: screen.getByRole("button", { name: "impact at 2.00 s" }) };
}

describe("a timeline marker", () => {
  it("seeks to its time on a click", () => {
    const { flag, onSeek, list } = ruler();

    fireEvent.pointerDown(flag, { button: 0, clientX: 20, pointerId: 1 });
    fireEvent.pointerUp(flag, { clientX: 20, pointerId: 1 });

    expect(onSeek).toHaveBeenCalledWith(2);
    expect(list.move).not.toHaveBeenCalled();
  });

  it("moves where a drag lets go, snapped", () => {
    const { flag, onSeek, list } = ruler();

    fireEvent.pointerDown(flag, { button: 0, clientX: 20, pointerId: 1 });
    fireEvent.pointerMove(flag, { clientX: 47, pointerId: 1 });
    fireEvent.pointerUp(flag, { clientX: 47, pointerId: 1 });

    expect(list.move).toHaveBeenCalledWith("impact", 5);
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("takes a name from a double click", () => {
    const { flag, list } = ruler();

    fireEvent.doubleClick(flag);
    const field = screen.getByRole("textbox", { name: "Marker name" });
    fireEvent.change(field, { target: { value: "hit" } });
    fireEvent.keyDown(field, { key: "Enter" });

    expect(list.rename).toHaveBeenCalledWith("impact", "hit");
  });

  it("keeps its name when the rename is dropped", () => {
    const { flag, list } = ruler();

    fireEvent.doubleClick(flag);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Marker name" }), { key: "Escape" });

    expect(list.rename).not.toHaveBeenCalled();
  });
});

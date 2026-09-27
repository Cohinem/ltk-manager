// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Track } from "../Track";

const BAR = { start: 1, end: 3, tail: 0, linger: 0, period: null, burst: false };

function track(onBarEdit = vi.fn(async () => true), onSeek = vi.fn()) {
  render(
    <Track
      label="smoke lane"
      view={{ from: 0, to: 10 }}
      width={100}
      bars={[BAR]}
      dimmed={false}
      right={0}
      onSeek={onSeek}
      onScrubStart={() => {}}
      onScrubEnd={() => {}}
      onBarEdit={onBarEdit}
    />,
  );
  return { lane: screen.getByRole("group", { name: "smoke lane" }), onBarEdit, onSeek };
}

describe("a lane's track", () => {
  it("snaps a dragged end to a tick, and writes the lifetime a free drag leaves", () => {
    const { lane, onBarEdit, onSeek } = track();

    fireEvent.pointerDown(lane, { button: 0, clientX: 30, pointerId: 1 });
    fireEvent.pointerMove(lane, { clientX: 45, pointerId: 1 });
    expect(screen.getByRole("status")).toHaveTextContent("Emits 3.00 s");
    fireEvent.pointerMove(lane, { clientX: 45, pointerId: 1, shiftKey: true });
    expect(screen.getByRole("status")).toHaveTextContent("Emits 3.50 s");
    fireEvent.pointerUp(lane, { clientX: 45, pointerId: 1 });

    expect(onBarEdit).toHaveBeenCalledWith("end", expect.objectContaining({ start: 1, end: 4.5 }));
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("seeks from a press on the bar that never travels", () => {
    const { lane, onBarEdit, onSeek } = track();

    fireEvent.pointerDown(lane, { button: 0, clientX: 20, pointerId: 1 });
    fireEvent.pointerUp(lane, { clientX: 20, pointerId: 1 });

    expect(onSeek).toHaveBeenCalledWith(20);
    expect(onBarEdit).not.toHaveBeenCalled();
  });

  it("drops a drag on Escape", () => {
    const { lane, onBarEdit } = track();

    fireEvent.pointerDown(lane, { button: 0, clientX: 10, pointerId: 1 });
    fireEvent.pointerMove(lane, { clientX: 40, pointerId: 1 });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerUp(lane, { clientX: 40, pointerId: 1 });

    expect(onBarEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("moves the whole bar by its body as one edit", () => {
    const { lane, onBarEdit } = track();

    fireEvent.pointerDown(lane, { button: 0, clientX: 20, pointerId: 1 });
    fireEvent.pointerMove(lane, { clientX: 35, pointerId: 1, shiftKey: true });
    fireEvent.pointerUp(lane, { clientX: 35, pointerId: 1 });

    expect(onBarEdit).toHaveBeenCalledWith(
      "move",
      expect.objectContaining({ start: 2.5, end: 4.5 }),
    );
  });
});

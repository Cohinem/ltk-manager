// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Scrub } from "../Scrub";

function scrubOver(span: number) {
  const onSeek = vi.fn();
  const onSeekCommit = vi.fn();
  render(
    <Scrub
      ref={null}
      label="Playhead"
      read={() => 1}
      span={span}
      onSeek={onSeek}
      onSeekCommit={onSeekCommit}
    />,
  );

  const scrub = screen.getByRole("slider", { name: "Playhead" });
  scrub.getBoundingClientRect = () => new DOMRect(100, 0, 200, 24);
  return { scrub, onSeek, onSeekCommit };
}

describe("Scrub", () => {
  it("seeks from the press, follows the drag past the rail's end, and commits on release", () => {
    const { scrub, onSeek, onSeekCommit } = scrubOver(2);

    fireEvent.pointerDown(scrub, { button: 0, clientX: 150 });
    expect(onSeek).toHaveBeenLastCalledWith(0.5);

    fireEvent.pointerMove(scrub, { clientX: 900 });
    expect(onSeek).toHaveBeenLastCalledWith(2);
    expect(onSeekCommit).not.toHaveBeenCalled();

    fireEvent.pointerUp(scrub);
    expect(onSeekCommit).toHaveBeenCalledExactlyOnceWith(2);
  });

  it("leaves a pointer that was not pressed on it alone", () => {
    const { scrub, onSeek, onSeekCommit } = scrubOver(2);

    fireEvent.pointerMove(scrub, { clientX: 150 });
    fireEvent.pointerUp(scrub);

    expect(onSeek).not.toHaveBeenCalled();
    expect(onSeekCommit).not.toHaveBeenCalled();
  });

  it("moves by frames from the arrows and to either end from Home and End", () => {
    const { scrub, onSeek, onSeekCommit } = scrubOver(2);

    fireEvent.keyDown(scrub, { key: "ArrowLeft" });
    expect(onSeek).toHaveBeenLastCalledWith(1 - 1 / 60);

    fireEvent.keyDown(scrub, { key: "End" });
    expect(onSeek).toHaveBeenLastCalledWith(2);
    expect(onSeekCommit).toHaveBeenLastCalledWith(2);

    fireEvent.keyDown(scrub, { key: "a" });
    expect(onSeek).toHaveBeenCalledTimes(2);
  });

  it("takes no focus over a span of nothing", () => {
    const { scrub } = scrubOver(0);

    expect(scrub).toHaveAttribute("aria-disabled", "true");
    expect(scrub).toHaveAttribute("tabindex", "-1");
  });
});

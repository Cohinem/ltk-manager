import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { useDisplayStore } from "@/stores";

import { ZoomLevelPicker } from "../ZoomLevelPicker";

const zoom = () => useDisplayStore.getState().zoomLevel;

describe("ZoomLevelPicker", () => {
  beforeEach(() => {
    useDisplayStore.setState({ zoomLevel: 100 });
  });

  it("shows the level the app is at", () => {
    render(<ZoomLevelPicker />);
    expect(screen.getByLabelText("Zoom percent")).toHaveValue("100");
  });

  /* The whole point of the field over a live-updating control: zoom re-lays out
     the page, so a level written per keystroke rescales the app under the
     cursor. Nothing reaches the store until the field is left. */
  it("holds a typed level until the field is left", async () => {
    const user = userEvent.setup();
    render(<ZoomLevelPicker />);
    const field = screen.getByLabelText("Zoom percent");

    await user.clear(field);
    await user.type(field, "150");
    expect(zoom()).toBe(100);

    await user.tab();
    expect(zoom()).toBe(150);
  });

  it("puts the live level back when the field is left empty", async () => {
    const user = userEvent.setup();
    render(<ZoomLevelPicker />);
    const field = screen.getByLabelText("Zoom percent");

    await user.clear(field);
    await user.tab();

    expect(zoom()).toBe(100);
    expect(field).toHaveValue("100");
  });

  it("follows a level set from somewhere else", () => {
    render(<ZoomLevelPicker />);
    act(() => {
      useDisplayStore.getState().setZoomLevel(130);
    });
    expect(screen.getByLabelText("Zoom percent")).toHaveValue("130");
  });
});

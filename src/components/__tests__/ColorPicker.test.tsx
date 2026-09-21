// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, type Mock, vi } from "vitest";

import { ColorPicker, Popover } from "@/components";
import type { RgbColor } from "@/utils";

function Picker({ start, onChange }: { start: RgbColor; onChange: (next: RgbColor) => void }) {
  const [value, setValue] = useState(start);
  return (
    <ColorPicker
      label="Sun colour"
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

function lastColor(onChange: Mock): RgbColor {
  const call = onChange.mock.lastCall;
  if (call === undefined) throw new Error("the picker reported no colour");
  return call[0] as RgbColor;
}

describe("ColorPicker", () => {
  it("moves brightness down one step on ArrowDown", () => {
    const onChange = vi.fn();
    render(<Picker start={[1, 0, 0]} onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole("slider", { name: "Sun colour" }), { key: "ArrowDown" });

    const [r, g, b] = lastColor(onChange);
    expect(r).toBeCloseTo(0.99);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it("takes six hex digits on Enter", async () => {
    const onChange = vi.fn();
    render(<Picker start={[1, 1, 1]} onChange={onChange} />);
    const field = screen.getByRole("textbox", { name: "Sun colour hex" });

    await userEvent.clear(field);
    await userEvent.type(field, "00FF00{Enter}");

    expect(onChange).toHaveBeenLastCalledWith([0, 1, 0]);
    expect(field).toHaveValue("00FF00");
  });

  it("drops text that is not a colour and shows the colour again", async () => {
    const onChange = vi.fn();
    render(<Picker start={[1, 0, 0]} onChange={onChange} />);
    const field = screen.getByRole("textbox", { name: "Sun colour hex" });

    await userEvent.clear(field);
    await userEvent.type(field, "nope{Enter}");

    expect(onChange).not.toHaveBeenCalled();
    expect(field).toHaveValue("FF0000");
  });

  it("keeps its hue through a grey", () => {
    const onChange = vi.fn();
    render(<Picker start={[0, 0, 1]} onChange={onChange} />);
    const shade = screen.getByRole("slider", { name: "Sun colour" });

    for (let at = 0; at < 10; at += 1) {
      fireEvent.keyDown(shade, { key: "ArrowLeft", shiftKey: true });
    }
    fireEvent.keyDown(shade, { key: "ArrowRight", shiftKey: true });

    const [r, g, b] = lastColor(onChange);
    expect(b).toBeGreaterThan(r);
    expect(r).toBeCloseTo(g);
  });

  it("keeps the popover it opened from open while the picker inside takes a press", async () => {
    render(
      <Popover.Root defaultOpen>
        <Popover.Trigger>Sun</Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner>
            <Popover.Popup aria-label="Sun">
              <Popover.Root>
                <Popover.Trigger>Sun colour</Popover.Trigger>
                <Popover.Portal>
                  <Popover.Positioner>
                    <Popover.Popup aria-label="Picker">
                      <Picker start={[1, 0, 0]} onChange={vi.fn()} />
                    </Popover.Popup>
                  </Popover.Positioner>
                </Popover.Portal>
              </Popover.Root>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Sun colour" }));
    await userEvent.click(screen.getByRole("slider", { name: "Sun colour" }));

    expect(screen.getByRole("dialog", { name: "Sun" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Picker" })).toBeInTheDocument();
  });
});

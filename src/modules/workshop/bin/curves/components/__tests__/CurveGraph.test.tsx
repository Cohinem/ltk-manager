// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { CurveKey, ProbabilityTable, ValueMark } from "../../../values/utils/valueRows";
import { randomDraw } from "../../utils/randomDraw";
import { CurveGraph } from "../CurveGraph";

const SIDE = 100;

beforeAll(() => {
  /* The graph plots in pixels, which happy-dom runs no layout to answer. */
  for (const measured of ["clientWidth", "clientHeight"]) {
    Object.defineProperty(HTMLElement.prototype, measured, {
      configurable: true,
      get: () => SIDE,
    });
  }

  HTMLElement.prototype.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: SIDE,
      bottom: SIDE,
      width: SIDE,
      height: SIDE,
      toJSON: () => ({}),
    }) as DOMRect;
  SVGElement.prototype.getBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
  SVGElement.prototype.setPointerCapture = vi.fn();
  SVGElement.prototype.hasPointerCapture = vi.fn(() => true);
  SVGElement.prototype.releasePointerCapture = vi.fn();
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});

const VECTOR: CurveKey[] = [
  { time: 0, values: [0, 5, 10] },
  { time: 1, values: [10, 5, 0] },
];

const COLOR: CurveKey[] = [
  { time: 0, values: [1, 0, 0, 1] },
  { time: 1, values: [0, 0, 1, 0] },
];

/** A vector whose X draws a uniform 0 to 360 over its base, and whose Y and Z are filler. */
function randomX(keys: CurveKey[]): ValueMark {
  const table = (channel: number, points: [number, number][]): ProbabilityTable => ({
    channel,
    single: 1,
    keys: points.map(([time, value]) => ({ time, values: [value] })),
  });
  return {
    family: "vector",
    constant: { type: "vector", values: [1, 0, 0] },
    keys,
    tables: [
      table(0, [
        [0, 0],
        [1, 360],
      ]),
      table(1, []),
      table(2, []),
    ],
    curve: true,
    slots: 3,
  };
}

function draw(keys: CurveKey[], family: "scalar" | "vector" | "color") {
  return render(<CurveGraph keys={keys} family={family} />).container;
}

const strokes = (container: HTMLElement) =>
  [...container.querySelectorAll("polyline")].map(
    (line) => line.parentElement?.getAttribute("class") ?? "",
  );

describe("CurveGraph", () => {
  it("draws a line per channel of a vector, each in a hue of its own", () => {
    const drawn = strokes(draw(VECTOR, "vector"));

    expect(drawn).toEqual(["text-channel-1", "text-channel-2", "text-channel-3"]);
  });

  it("draws no line for a channel the toolbar muted", () => {
    const { container } = render(<CurveGraph keys={VECTOR} family="vector" muted={new Set([1])} />);

    expect(strokes(container)).toEqual(["text-channel-1", "text-channel-3"]);
  });

  it("draws a random value whose base holds still as lanes, with no time plot", () => {
    const { container } = render(
      <CurveGraph keys={[]} family="vector" draw={randomDraw(randomX([]))} unit="degrees" />,
    );

    expect(screen.getByRole("slider", { name: "Pin the chance on X" })).toBeInTheDocument();
    expect(screen.getByText("0 .. 360")).toBeInTheDocument();
    expect(container.querySelector('[data-ui="ChannelPlot"]')).toBeNull();
  });

  it("draws an animated random value over time, with the births at one time beside it", () => {
    const { container } = render(
      <CurveGraph keys={VECTOR} family="vector" draw={randomDraw(randomX(VECTOR))} />,
    );

    const plot = container.querySelector('[data-ui="ChannelPlot"] svg');
    expect(plot?.querySelectorAll("polyline")).toHaveLength(3);
    expect(screen.getByText("births")).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: "How often each value is drawn" })).toHaveLength(1);
    expect(screen.getByText("uniform")).toBeInTheDocument();
  });

  it("names the unit by the top value tick, and ticks time at its quarters", () => {
    render(<CurveGraph keys={VECTOR} family="vector" unit="rate" />);

    expect(screen.getByText("/s")).toBeInTheDocument();
    expect(screen.getByText("0.25")).toBeInTheDocument();
  });

  it("draws a colour as its ramp alone, with no line and no channel chip", () => {
    const container = draw(COLOR, "color");

    expect(screen.getByLabelText("2 colour stops")).toBeInTheDocument();
    expect(strokes(container)).toEqual([]);
    for (const channel of ["R", "G", "B", "A"]) {
      expect(screen.queryByRole("button", { name: channel })).toBeNull();
    }
  });

  it("puts a handle on the axis at each stop's own time", () => {
    draw(
      [
        { time: 0.25, values: [1, 0, 0, 1] },
        { time: 0.75, values: [0, 0, 1, 0] },
      ],
      "color",
    );

    const first = screen.getByRole("button", { name: "Colour stop at 0.250, #FF0000FF" });
    const last = screen.getByRole("button", { name: "Colour stop at 0.750, #0000FF00" });

    expect(first).toHaveStyle({ left: "25.00%" });
    expect(last).toHaveStyle({ left: "75.00%" });
  });

  it("leaves the colour key table to the authoring surface around the ramp", () => {
    draw(COLOR, "color");

    expect(screen.queryByRole("table")).toBeNull();
  });

  it("reports the colour stop selected on the ramp", async () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <CurveGraph keys={COLOR} family="color" selected={new Set([0])} onSelect={onSelect} />,
    );
    const user = userEvent.setup();
    const first = screen.getByRole("button", { name: "Colour stop at 0.000, #FF0000FF" });
    const last = screen.getByRole("button", { name: "Colour stop at 1.000, #0000FF00" });

    expect(first).toHaveAttribute("aria-pressed", "true");
    await user.click(last);
    expect(onSelect).toHaveBeenCalledWith(1, "replace");

    rerender(
      <CurveGraph keys={COLOR} family="color" selected={new Set([1])} onSelect={onSelect} />,
    );
    expect(screen.getByRole("button", { name: "Colour stop at 1.000, #0000FF00" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("selects a graph point and adds an interpolated key on double click", async () => {
    const onSelect = vi.fn();
    const onAdd = vi.fn();
    const { container } = render(
      <CurveGraph keys={VECTOR} family="vector" editable onSelect={onSelect} onAdd={onAdd} />,
    );

    await userEvent.setup().click(screen.getByRole("button", { name: "X key 2 at 1.000" }));
    expect(onSelect).toHaveBeenCalledWith(1, "replace");

    const canvas = container.querySelector<HTMLElement>('[data-ui="ChannelPlot:canvas"]');
    expect(canvas).not.toBeNull();
    fireEvent.doubleClick(canvas!, { clientX: SIDE / 2 });
    expect(onAdd).toHaveBeenCalledWith({ time: 0.5, values: [5, 5, 5] });
  });

  it("toggles points with a modifier and box-selects keys across channels", async () => {
    const onSelect = vi.fn();
    const onSelectMany = vi.fn();
    const { container } = render(
      <CurveGraph
        keys={VECTOR}
        family="vector"
        selected={new Set([0])}
        editable
        onSelect={onSelect}
        onSelectMany={onSelectMany}
      />,
    );
    const second = screen.getByRole("button", { name: "X key 2 at 1.000" });

    fireEvent.click(second, { ctrlKey: true });
    expect(onSelect).toHaveBeenLastCalledWith(1, "toggle");

    const canvas = container.querySelector<HTMLElement>('[data-ui="ChannelPlot:canvas"]')!;
    fireEvent.pointerDown(canvas, { pointerId: 7, button: 0, clientX: 75, clientY: 0 });
    fireEvent.pointerMove(canvas, { pointerId: 7, clientX: 100, clientY: 100 });
    expect(canvas.querySelector(".border-accent-400")).toBeInTheDocument();

    fireEvent.pointerUp(canvas, { pointerId: 7, clientX: 100, clientY: 100 });
    expect(onSelectMany).toHaveBeenCalledWith([1], "replace");
  });

  it("keeps a dragged key in place until the authored curve refreshes", () => {
    const onChange = vi.fn(async () => true);
    const { container } = render(
      <CurveGraph keys={VECTOR} family="vector" editable onChange={onChange} />,
    );
    const point = screen.getByRole("button", { name: "X key 2 at 1.000" });
    const line = container.querySelector("polyline");
    const before = line?.getAttribute("points");

    fireEvent.pointerDown(point, { pointerId: 1, clientX: 80, clientY: 20 });
    fireEvent.pointerMove(point, { pointerId: 1, clientX: 70, clientY: 30 });
    const dragged = line?.getAttribute("points");
    fireEvent.pointerUp(point, { pointerId: 1, clientX: 70, clientY: 30 });

    expect(onChange).toHaveBeenCalledOnce();
    expect(dragged).not.toBe(before);
    expect(line).toHaveAttribute("points", dragged);
  });

  it("offers neither handle nor readout for a family that is no colour", () => {
    draw(VECTOR, "vector");

    expect(screen.queryByLabelText(/Colour stop at/)).toBeNull();
  });

  it("draws a scalar with no chips, because it has one channel to tell apart from none", () => {
    draw(
      [
        { time: 0, values: [1] },
        { time: 1, values: [2] },
      ],
      "scalar",
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

import { describe, expect, it } from "vitest";

import type { PixelRect } from "../layout/solve";
import {
  chooseTooltip,
  splitTooltip,
  tooltipSamples,
  type TooltipInputs,
  tooltipOverlay,
  type TooltipSample,
  type ViewTooltip,
  withShift,
} from "../model/tooltip";

const TOOLTIP: ViewTooltip = {
  icon: "icon",
  iconOverlay: "iconOverlay",
  titleLeft: "titleLeft",
  titleRight: "titleRight",
  subtitleLeft: "subtitleLeft",
  subtitleRight: "subtitleRight",
  mainText: "mainText",
  postScriptTitle: "postScriptTitle",
  postScriptLeft: "postScriptLeft",
  postScriptRight: "postScriptRight",
  backdrop: "backdrop",
  hrTop: "hrTop",
  hrBottom: "hrBottom",
  hrTopSubScene: "hrTopSubScene",
  hrBottomSubScene: "hrBottomSubScene",
  caret: "caret",
  adjustments: {
    iconSkipsTopHrPre: true,
    titleY: 0,
    topHrYPre: 0,
    topHrYPost: 0,
    bottomHrYPre: 0,
    bottomHrYPost: 0,
    bottomYPadding: 0,
  },
};

const ORIGIN = { x: 100, y: 50 };

/** The parts as `TFTCommon/UX/Tooltips` places them at 1600 x 1200, moved to `ORIGIN`. */
const SOLVED = new Map<string, PixelRect>(
  (
    [
      ["backdrop", 0, 0, 4, 4],
      ["icon", 12, 12, 85, 85],
      ["iconOverlay", 12, 12, 85, 85],
      ["titleLeft", 12, 16, 770, 34],
      ["titleRight", 12, 16, 770, 34],
      ["subtitleLeft", 12, 10, 770, 40],
      ["subtitleRight", 12, 10, 770, 40],
      ["mainText", 12, 19, 770, 563],
      ["postScriptTitle", 12, 12, 770, 588],
      ["postScriptLeft", 12, 12, 770, 38],
      ["postScriptRight", 12, 12, 770, 38],
      ["hrTop", 10, 0, 4, 3],
      ["hrBottom", 10, 0, 4, 3],
      ["caret", 12, 12, 34, 17],
    ] as const
  ).map(([key, x, y, w, h]) => [key, { x: ORIGIN.x + x, y: ORIGIN.y + y, w, h }]),
);

const ICON = { path: "icon.dds", asset: null, page: false };

const LINE = 20;
const LEFT_WIDTH = 100;
const RIGHT_WIDTH = 50;

/** Every text one line tall, a right-hand text right-aligned in its box. */
const INPUTS: TooltipInputs = {
  solved: SOLVED,
  scale: 1,
  measure: (element, _text, width) =>
    element.endsWith("Right")
      ? { x: width - RIGHT_WIDTH, y: 0, w: RIGHT_WIDTH, h: LINE }
      : { x: 0, y: 0, w: LEFT_WIDTH, h: LINE },
};

function sample(text: string, icon = false): TooltipSample {
  return {
    id: "Q",
    name: "Test",
    hotkey: "Q",
    text,
    extended: null,
    ranks: 1,
    icon: icon ? ICON : null,
  };
}

/** A moved rect relative to the backdrop's top left. */
function local(rect: PixelRect | undefined): PixelRect | undefined {
  return rect === undefined ? undefined : { ...rect, x: rect.x - ORIGIN.x, y: rect.y - ORIGIN.y };
}

describe("tooltipSamples", () => {
  const tooltips = [
    { name: "Essence Theft", hotkey: null, text: "P", extended: null, ranks: 1, icon: ICON },
    { name: "Orb", hotkey: "Q", text: "Q", extended: "Q with Shift", ranks: 5, icon: null },
  ];

  it("lists each ability by the key that casts it", () => {
    expect(tooltipSamples(tooltips).map((each) => each.id)).toEqual(["passive", "Q"]);
  });

  it("chooses the sample an id names, the first for an unknown id, and none of none", () => {
    const samples = tooltipSamples(tooltips);

    expect(chooseTooltip(samples, "Q")?.name).toBe("Orb");
    expect(chooseTooltip(samples, "R")?.id).toBe("passive");
    expect(chooseTooltip(tooltipSamples(null), "Q")).toBeNull();
  });

  it("shows the text Shift shows while extended, and its own where it has none", () => {
    const [passive, orb] = tooltipSamples(tooltips);

    expect(withShift(orb ?? null, true)?.text).toBe("Q with Shift");
    expect(withShift(orb ?? null, false)?.text).toBe("Q");
    expect(withShift(passive ?? null, true)?.text).toBe("P");
    expect(withShift(null, true)).toBeNull();
  });
});

describe("splitTooltip", () => {
  it("wraps each section in its own tag", () => {
    const sections = splitTooltip("<titleLeft>Turret</titleLeft><mainText>Shoots.</mainText>");

    expect(sections.titleLeft).toBe("<titleLeft>Turret</titleLeft>");
    expect(sections.mainText).toBe("<mainText>Shoots.</mainText>");
    expect(sections.subtitleLeft).toBe("");
  });

  it("joins text outside every section to the main text", () => {
    const sections = splitTooltip("Before <b>bold</b><titleLeft>T</titleLeft> after");

    expect(sections.mainText).toBe("<mainText>Before <b>bold</b> after</mainText>");
  });

  it("reads infoArea as the right postscript", () => {
    expect(splitTooltip("<infoArea>Info</infoArea>").postScriptRight).toBe(
      "<postScriptRight>Info</postScriptRight>",
    );
  });

  it("clears a section left empty", () => {
    expect(splitTooltip("<subtitleLeft></subtitleLeft>").subtitleLeft).toBe("");
  });

  it("cleans tabs, rules and arrows", () => {
    expect(splitTooltip("<mainText>a\tb<br><hr><br>c -> d <- e</mainText>").mainText).toBe(
      "<mainText>a b<br><br>c %i:rightArrow% d %i:leftArrow% e</mainText>",
    );
  });
});

describe("tooltipOverlay", () => {
  it("stacks the title, subtitle, top line and main text", () => {
    const laid = tooltipOverlay(
      TOOLTIP,
      sample("<titleLeft>T</titleLeft><subtitleLeft>S</subtitleLeft><mainText>M</mainText>"),
      INPUTS,
    );

    expect(local(laid.moved.get("titleLeft"))).toMatchObject({ x: 12, y: 16, h: LINE });
    expect(local(laid.moved.get("subtitleLeft"))).toMatchObject({ y: 36 + 10 });
    expect(local(laid.moved.get("hrTop"))).toMatchObject({ y: 66, h: 3 });
    expect(local(laid.moved.get("mainText"))).toMatchObject({ y: 69 + 19, h: LINE });
  });

  it("fits the backdrop to the text with the left inset on the right and bottom", () => {
    const laid = tooltipOverlay(
      TOOLTIP,
      sample("<titleLeft>T</titleLeft><mainText>M</mainText>"),
      INPUTS,
    );

    const main = local(laid.moved.get("mainText"));
    expect(laid.moved.get("backdrop")).toEqual({
      ...ORIGIN,
      w: 12 + LEFT_WIDTH + 12,
      h: (main?.y ?? 0) + LINE + 12,
    });
    expect(local(laid.moved.get("hrTop"))).toMatchObject({ x: 10, w: 12 + LEFT_WIDTH + 12 - 20 });
  });

  it("moves the left texts past the icon and ends the right ones at the right inset", () => {
    const laid = tooltipOverlay(
      TOOLTIP,
      sample("<titleLeft>T</titleLeft><titleRight>R</titleRight><mainText>M</mainText>", true),
      INPUTS,
    );

    const title = local(laid.moved.get("titleLeft"));
    const right = local(laid.moved.get("titleRight"));
    const width = laid.moved.get("backdrop")?.w ?? 0;
    expect(title?.x).toBe(12 + 85);
    expect(right?.x).toBe(12 + 85 + LEFT_WIDTH);
    expect((right?.x ?? 0) + (right?.w ?? 0)).toBe(width - 12);
    expect(width).toBe(12 + 85 + LEFT_WIDTH + RIGHT_WIDTH + 12);
    expect(local(laid.moved.get("hrTop"))?.y).toBe(12 + 85);
  });

  it("puts the postscript under the bottom line", () => {
    const laid = tooltipOverlay(
      TOOLTIP,
      sample("<mainText>M</mainText><postScriptLeft>P</postScriptLeft>"),
      INPUTS,
    );

    const main = local(laid.moved.get("mainText"));
    const bottom = (main?.y ?? 0) + LINE;
    expect(laid.moved.has("hrTop")).toBe(false);
    expect(local(laid.moved.get("hrBottom"))?.y).toBe(bottom);
    expect(local(laid.moved.get("postScriptLeft"))?.y).toBe(bottom + 3 + 12);
  });

  it("reads each shown section and draws every other part off", () => {
    const laid = tooltipOverlay(TOOLTIP, sample("<titleLeft>Turret</titleLeft>"), INPUTS);

    expect(laid.texts).toEqual(new Map([["titleLeft", "<titleLeft>Turret</titleLeft>"]]));
    expect([...laid.hidden].sort()).toEqual(
      [
        "caret",
        "hrBottom",
        "hrBottomSubScene",
        "hrTop",
        "hrTopSubScene",
        "icon",
        "iconOverlay",
        "mainText",
        "postScriptLeft",
        "postScriptRight",
        "postScriptTitle",
        "subtitleLeft",
        "subtitleRight",
        "titleRight",
      ].sort(),
    );
  });

  it("applies the adjustments at the given scale", () => {
    const adjusted: ViewTooltip = {
      ...TOOLTIP,
      adjustments: { ...TOOLTIP.adjustments, titleY: 3, topHrYPre: 4, topHrYPost: 5 },
    };
    const laid = tooltipOverlay(
      adjusted,
      sample("<titleLeft>T</titleLeft><mainText>M</mainText>"),
      { ...INPUTS, scale: 2 },
    );

    expect(local(laid.moved.get("titleLeft"))?.y).toBe(6 + 16);
    expect(local(laid.moved.get("hrTop"))?.y).toBe(6 + 16 + LINE + 8);
    expect(local(laid.moved.get("mainText"))?.y).toBe(6 + 16 + LINE + 8 + 3 + 10 + 19);
  });

  it("lays out nothing without a backdrop", () => {
    const laid = tooltipOverlay(
      { ...TOOLTIP, backdrop: null },
      sample("<mainText>M</mainText>"),
      INPUTS,
    );

    expect(laid.moved.size).toBe(0);
  });
});

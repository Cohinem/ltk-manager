// @vitest-environment happy-dom

import { CubeIcon } from "@phosphor-icons/react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChampionIcon, SkinIcon } from "@/components";

import { ObjectGlyph, objectIcon } from "../ObjectGlyph";

describe("objectIcon", () => {
  it("gives a champion and a skin their own marks, and every other class the cube", () => {
    expect(objectIcon("Champion")).toBe(ChampionIcon);
    expect(objectIcon("SkinCharacterDataProperties")).toBe(SkinIcon);
    expect(objectIcon("CharacterRecord")).toBe(CubeIcon);
    expect(objectIcon("0x9b67e9f6")).toBe(CubeIcon);
    expect(objectIcon(null)).toBe(CubeIcon);
    expect(objectIcon(undefined)).toBe(CubeIcon);
  });
});

describe("ObjectGlyph", () => {
  it("draws the mark at the size its caller gives", () => {
    const { container } = render(<ObjectGlyph objectClass="Champion" className="h-4 w-4" />);

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveClass("h-4", "w-4");
  });
});

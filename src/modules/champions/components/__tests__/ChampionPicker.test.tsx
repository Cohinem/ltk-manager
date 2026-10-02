// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChampionPicker } from "../ChampionPicker";

vi.mock("../../api", async () => {
  const { championRoster } = await import("../../utils/roster");
  const roster = championRoster([
    { id: "Ahri", metadataName: "Ahri", name: "Ahri", icon: null },
    { id: "MonkeyKing", metadataName: "Wukong", name: "Wukong", icon: null },
  ]);
  return { useChampionRoster: () => roster };
});

const onChange = vi.fn<(champions: string[]) => void>();

function show(value: string[]) {
  render(<ChampionPicker value={value} onChange={onChange} aria-label="Champions" />);
  return screen.getByRole("combobox", { name: "Champions" });
}

beforeEach(() => {
  onChange.mockReset();
});

describe("ChampionPicker", () => {
  it("shows each value as a chip under its champion's display name", () => {
    show(["monkeyking", "Teemo"]);

    expect(screen.getByText("Wukong")).toBeInTheDocument();
    expect(screen.getByText("Teemo")).toBeInTheDocument();
  });

  it("adds a picked champion by the name categorization writes", async () => {
    const input = show(["monkeyking"]);

    await userEvent.type(input, "ah");
    await userEvent.click(await screen.findByRole("option", { name: /Ahri/ }));

    expect(onChange).toHaveBeenLastCalledWith(["monkeyking", "Ahri"]);
  });

  it("adds a typed name no champion answers to, as typed", async () => {
    const input = show([]);

    await userEvent.type(input, "Mel");
    await userEvent.click(await screen.findByRole("option", { name: 'Add "Mel"' }));

    expect(onChange).toHaveBeenLastCalledWith(["Mel"]);
  });

  it("offers no added row for a name a champion already answers to", async () => {
    const input = show([]);

    await userEvent.type(input, "wukong");

    expect(await screen.findByRole("option", { name: /Wukong/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /^Add/ })).not.toBeInTheDocument();
  });

  it("drops a chip's value when its remove button is pressed", async () => {
    show(["Ahri", "Teemo"]);

    await userEvent.click(screen.getByRole("button", { name: "Remove Ahri" }));

    expect(onChange).toHaveBeenLastCalledWith(["Teemo"]);
  });
});

// @vitest-environment happy-dom

import { QuestionIcon } from "@phosphor-icons/react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { type SkinChoice, SkinChoiceContext } from "../../state/skinChoice";
import type { PhysicsItem } from "../../utils/physicsItems";
import { type PhysicsScope, PhysicsScopeContext } from "../PhysicsCells";
import { PhysicsList } from "../PhysicsList";

const SCOPE = { diagnostics: [] } as unknown as PhysicsScope;

function items(...paths: string[]): PhysicsItem[] {
  return paths.map((path) => ({
    path,
    icon: QuestionIcon,
    title: path,
    detail: null,
    previewed: true,
  }));
}

function draw(held: PhysicsItem[], selected: string | null) {
  const onSelect = vi.fn();
  const onOpen = vi.fn();
  const toggleMuted = vi.fn();
  const choice = { muted: new Set<string>(), toggleMuted } as unknown as SkinChoice;
  render(
    <SkinChoiceContext value={choice}>
      <PhysicsScopeContext value={SCOPE}>
        <PhysicsList
          items={held}
          selected={selected}
          onSelect={onSelect}
          onOpen={onOpen}
          label="Pose modifiers"
          empty="No pose modifiers"
        />
      </PhysicsScopeContext>
    </SkinChoiceContext>,
  );

  return { onSelect, onOpen, toggleMuted };
}

describe("PhysicsList", () => {
  it("says an empty list holds nothing, in place of the list", () => {
    draw([], null);

    expect(screen.getByText("No pose modifiers")).toBeTruthy();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("moves the pick with the arrows, Home and End", () => {
    const { onSelect } = draw(items("a", "b", "c"), "b");
    const picked = screen.getByRole("option", { selected: true });

    for (const key of ["ArrowUp", "ArrowDown", "Home", "End"]) {
      fireEvent.keyDown(picked, { key });
    }

    expect(onSelect.mock.calls.map(([path]) => path)).toEqual(["a", "c", "a", "c"]);
  });

  it("stays on the first and the last item at the ends of the list", () => {
    const { onSelect } = draw(items("a", "b"), "a");

    fireEvent.keyDown(screen.getByRole("option", { selected: true }), { key: "ArrowUp" });

    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("opens the picked item on Enter, on Space and on a click", () => {
    const { onOpen } = draw(items("a", "b", "c"), "b");
    const picked = screen.getByRole("option", { selected: true });

    fireEvent.keyDown(picked, { key: "Enter" });
    fireEvent.keyDown(picked, { key: " " });
    fireEvent.click(picked);

    expect(onOpen.mock.calls.map(([path]) => path)).toEqual(["b", "b", "b"]);
  });

  it("holds the preview switch beside the option, where a click on it opens nothing", () => {
    const { onOpen, toggleMuted } = draw(items("a"), "a");
    const option = screen.getByRole("option");
    const [eye] = screen.getAllByRole("button");

    fireEvent.click(eye);

    expect(within(option).queryByRole("button")).toBeNull();
    expect(toggleMuted).toHaveBeenCalledWith("a");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("makes the picked item the list's one tab stop", () => {
    draw(items("a", "b"), "b");

    const stops = screen.getAllByRole("option").map((option) => option.tabIndex);
    const [eye] = screen.getAllByRole("button");

    expect(stops).toEqual([-1, 0]);
    expect(eye.tabIndex).toBe(-1);
  });
});

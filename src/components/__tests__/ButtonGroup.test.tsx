// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ButtonGroup, IconButton, Menu } from "@/components";

/* The join is positional CSS, so it can only be right while every child that is
   not a member is a span. Base UI parks a menu's portal scaffolding beside the
   trigger, inside this group, and adds to it between releases - this is what
   fails when it adds something that is not one. */
function renderGroup(open: boolean) {
  render(
    <ButtonGroup>
      <IconButton icon={<span>+</span>} variant="filled" size="sm" aria-label="New project" />
      <Menu.Root open={open}>
        <Menu.Trigger
          render={
            <IconButton icon={<span>v</span>} variant="filled" size="sm" aria-label="Import" />
          }
        />
        <Menu.Portal>
          <Menu.Positioner>
            <Menu.Popup>
              <Menu.Item>From Fantome</Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </ButtonGroup>,
  );

  const group = document.querySelector('[role="group"]')!;
  return [...group.children].filter((child) => child.tagName !== "SPAN");
}

describe("ButtonGroup", () => {
  it("ends on the trigger while its menu is shut", () => {
    const members = renderGroup(false);

    expect(members.at(-1)).toBe(screen.getByRole("button", { name: "Import" }));
    expect(members).toHaveLength(2);
  });

  it("ends on the trigger while its menu is open, past the portal's own spans", () => {
    const members = renderGroup(true);

    expect(members.at(-1)).toBe(screen.getByRole("button", { name: "Import" }));
    expect(members).toHaveLength(2);
  });
});

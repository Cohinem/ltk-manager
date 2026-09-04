// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Menu } from "@/components";

/* A submenu holding a radio group is how a menu offers a choice between states
   rather than a button naming the state it is not. Base UI wires the checked
   mark and the value, so what is worth pinning here is that the wrapper passes
   both through. */
function renderStorageMenu({
  value = "project",
  onValueChange = vi.fn(),
  disabled = false,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
} = {}) {
  render(
    <Menu.Root open>
      <Menu.Trigger>Actions</Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner>
          <Menu.Popup>
            <Menu.SubmenuRoot>
              <Menu.SubmenuTrigger disabled={disabled}>Storage</Menu.SubmenuTrigger>
              <Menu.Portal>
                <Menu.SubmenuPositioner>
                  <Menu.Popup>
                    <Menu.RadioGroup
                      value={value}
                      onValueChange={(next) => onValueChange(next as string)}
                    >
                      <Menu.RadioItem value="project" closeOnClick>
                        Project
                      </Menu.RadioItem>
                      <Menu.RadioItem value="archive" closeOnClick>
                        Archive
                      </Menu.RadioItem>
                    </Menu.RadioGroup>
                  </Menu.Popup>
                </Menu.SubmenuPositioner>
              </Menu.Portal>
            </Menu.SubmenuRoot>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>,
  );
}

/** Point at the trigger and wait out Base UI's open delay. */
async function openStorage(user: ReturnType<typeof userEvent.setup>) {
  await user.hover(screen.getByRole("menuitem", { name: "Storage" }));
  await waitFor(() => expect(screen.queryAllByRole("menuitemradio").length).toBeGreaterThan(0), {
    timeout: 500,
  }).catch(() => undefined);
}

describe("Menu submenu", () => {
  it("opens its popup from the trigger", async () => {
    const user = userEvent.setup();
    renderStorageMenu();

    expect(screen.queryByRole("menuitemradio", { name: "Archive" })).toBeNull();
    await openStorage(user);

    expect(screen.getByRole("menuitemradio", { name: "Project" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Archive" })).toBeInTheDocument();
  });

  it("marks the current value and no other", async () => {
    const user = userEvent.setup();
    renderStorageMenu({ value: "archive" });
    await openStorage(user);

    expect(screen.getByRole("menuitemradio", { name: "Archive" })).toBeChecked();
    expect(screen.getByRole("menuitemradio", { name: "Project" })).not.toBeChecked();
  });

  it("reports the value the reader picked", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderStorageMenu({ value: "project", onValueChange });

    await openStorage(user);
    /* `fireEvent`, because userEvent's pointer path moves off the trigger the
       submenu is open from and shuts it before the click lands. */
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Archive" }));

    expect(onValueChange).toHaveBeenCalledWith("archive");
  });

  /* Disabling the trigger is how a conversion in flight stops a second one,
     so the submenu behind it has to stay shut. */
  it("does not open while its trigger is disabled", async () => {
    const user = userEvent.setup();
    renderStorageMenu({ disabled: true });

    await openStorage(user);

    expect(screen.queryByRole("menuitemradio", { name: "Archive" })).toBeNull();
  });
});

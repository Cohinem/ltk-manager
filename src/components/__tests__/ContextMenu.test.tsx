// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ContextMenu } from "../ContextMenu";

function Subject({
  onSort,
  onThumbnails,
}: {
  onSort: (value: unknown) => void;
  onThumbnails: (on: boolean) => void;
}) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger>
        <div>Target</div>
      </ContextMenu.Trigger>
      <ContextMenu.Content>
        <ContextMenu.Item>Rename</ContextMenu.Item>
        <ContextMenu.Group>
          <ContextMenu.GroupLabel>Sort by</ContextMenu.GroupLabel>
          <ContextMenu.RadioGroup value="name" onValueChange={onSort}>
            <ContextMenu.RadioItem value="name">Name</ContextMenu.RadioItem>
            <ContextMenu.RadioItem value="size">Size</ContextMenu.RadioItem>
          </ContextMenu.RadioGroup>
        </ContextMenu.Group>
        <ContextMenu.CheckboxItem checked={false} onCheckedChange={onThumbnails}>
          Thumbnails
        </ContextMenu.CheckboxItem>
      </ContextMenu.Content>
    </ContextMenu.Root>
  );
}

describe("ContextMenu", () => {
  it("lists radio and checkbox rows under a labelled group", async () => {
    render(<Subject onSort={vi.fn()} onThumbnails={vi.fn()} />);

    fireEvent.contextMenu(screen.getByText("Target"));

    expect(await screen.findByRole("menuitem", { name: "Rename" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Sort by" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Name" })).toBeChecked();
    expect(screen.getByRole("menuitemradio", { name: "Size" })).not.toBeChecked();
    expect(screen.getByRole("menuitemcheckbox", { name: "Thumbnails" })).not.toBeChecked();
  });

  it("reports the radio row and the checkbox row that are pressed", async () => {
    const onSort = vi.fn();
    const onThumbnails = vi.fn();
    render(<Subject onSort={onSort} onThumbnails={onThumbnails} />);

    fireEvent.contextMenu(screen.getByText("Target"));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "Size" }));
    expect(onSort).toHaveBeenCalledWith("size", expect.anything());

    fireEvent.contextMenu(screen.getByText("Target"));
    await userEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Thumbnails" }));
    expect(onThumbnails).toHaveBeenCalledWith(true, expect.anything());
  });
});

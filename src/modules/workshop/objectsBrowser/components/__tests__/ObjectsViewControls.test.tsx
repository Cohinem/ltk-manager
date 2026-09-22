// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { ObjectsViewControls } from "../ObjectsViewControls";

afterEach(cleanup);

it("groups thumbnail and size preferences inside view options", async () => {
  const change = vi.fn();
  const user = userEvent.setup();
  render(
    <ObjectsViewControls
      view="grid"
      onViewChange={vi.fn()}
      thumbnails
      onThumbnailsChange={change}
      size={128}
      onSizeChange={vi.fn()}
    />,
  );
  expect(screen.queryByRole("switch")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Sort and view" }));
  const thumbnails = screen.getByRole("switch", { name: "Thumbnails" });
  expect(thumbnails).toBeChecked();
  expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "128");
  await user.click(thumbnails);
  expect(change).toHaveBeenCalledWith(false, expect.anything());
});

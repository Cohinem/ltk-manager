// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { EditorTab } from "../components/EditorTabs";
import { TabOverflowList } from "../components/TabOverflowList";

const TABS: readonly EditorTab[] = [
  { id: "a", title: "Alpha", context: "Base" },
  { id: "b", title: "Beta", dirty: true },
  { id: "c", title: "Gamma" },
];

interface DrawOptions {
  offscreen?: number;
  activeId?: string | null;
}

function draw({ offscreen = 2, activeId = "a" }: DrawOptions = {}) {
  const onActivate = vi.fn();
  const onClose = vi.fn();

  render(
    <TabOverflowList
      tabs={TABS}
      activeId={activeId}
      offscreen={offscreen}
      onActivate={onActivate}
      onClose={onClose}
    />,
  );
  return { onActivate, onClose };
}

async function openList() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "2 tabs off screen" }));
  return user;
}

describe("TabOverflowList", () => {
  it("stands over a strip that holds a tab out of view", () => {
    draw();

    expect(screen.getByRole("button", { name: "2 tabs off screen" })).toBeTruthy();
  });

  it("stands over no strip the lane holds whole", () => {
    draw({ offscreen: 0 });

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("lists every tab of the group in strip order", async () => {
    draw();
    await openList();

    const titles = screen.getAllByRole("listitem").map((row) => row.textContent);

    expect(titles).toHaveLength(3);
    expect(titles[0]).toContain("Alpha");
    expect(titles[0]).toContain("Base");
    expect(titles[2]).toContain("Gamma");
  });

  it("activates the tab a row names", async () => {
    const { onActivate } = draw();
    const user = await openList();

    await user.click(screen.getByRole("button", { name: "Gamma" }));

    expect(onActivate).toHaveBeenCalledWith("c");
  });

  it("closes the tab a row's own close names", async () => {
    const { onClose } = draw();
    const user = await openList();

    await user.click(screen.getByRole("button", { name: "Close Beta" }));

    expect(onClose).toHaveBeenCalledWith("b");
  });
});

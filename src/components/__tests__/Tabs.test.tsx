// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Tabs, type TabsVariant } from "../Tabs";

function Demo({ variant, vertical = false }: { variant: TabsVariant; vertical?: boolean }) {
  return (
    <Tabs.Root defaultValue="games" orientation={vertical ? "vertical" : "horizontal"}>
      <Tabs.List variant={variant}>
        <Tabs.Tab value="games">Games</Tabs.Tab>
        <Tabs.Tab value="system">System</Tabs.Tab>
        <Tabs.Tab value="logs" disabled>
          Logs
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="games">The games panel</Tabs.Panel>
      <Tabs.Panel value="system">The system panel</Tabs.Panel>
      <Tabs.Panel value="logs">The logs panel</Tabs.Panel>
    </Tabs.Root>
  );
}

describe("Tabs", () => {
  it.each<TabsVariant>(["default", "pills", "rail", "plain"])(
    "shows the panel of the tab pressed in a %s list",
    async (variant) => {
      const user = userEvent.setup();
      render(<Demo variant={variant} />);

      await user.click(screen.getByRole("tab", { name: "System" }));

      expect(screen.getByText("The system panel")).toBeInTheDocument();
      expect(screen.queryByText("The games panel")).not.toBeInTheDocument();
    },
  );

  it("keeps a disabled tab from opening its panel", async () => {
    const user = userEvent.setup();
    render(<Demo variant="default" />);

    await user.click(screen.getByRole("tab", { name: "Logs" }));

    expect(screen.queryByText("The logs panel")).not.toBeInTheDocument();
  });

  it("moves between the tabs of a rail with Up and Down", async () => {
    const user = userEvent.setup();
    render(<Demo variant="rail" vertical />);

    await user.click(screen.getByRole("tab", { name: "Games" }));
    await user.keyboard("{ArrowDown}");

    expect(screen.getByRole("tab", { name: "System" })).toHaveFocus();
  });
});

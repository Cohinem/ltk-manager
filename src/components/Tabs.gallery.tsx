import type { GalleryEntry } from "./galleryEntry";
import { Tabs, type TabsVariant } from "./Tabs";

function Demo({ variant, divider }: { variant: TabsVariant; divider?: boolean }) {
  const vertical = variant === "rail";

  return (
    <Tabs.Root
      defaultValue="games"
      orientation={vertical ? "vertical" : "horizontal"}
      className={vertical ? "w-96 flex-row gap-4" : "w-96 gap-3"}
    >
      <Tabs.List variant={variant} divider={divider} className={vertical ? "w-40" : undefined}>
        <Tabs.Tab value="games">Games</Tabs.Tab>
        <Tabs.Tab value="system">System</Tabs.Tab>
        <Tabs.Tab value="logs" disabled>
          Logs
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="games" className="text-sm text-surface-400">
        The games panel
      </Tabs.Panel>
      <Tabs.Panel value="system" className="text-sm text-surface-400">
        The system panel
      </Tabs.Panel>
    </Tabs.Root>
  );
}

const entry: GalleryEntry = {
  name: "Tabs",
  family: "navigation",
  cases: [
    { name: "Default", render: () => <Demo variant="default" /> },
    {
      name: "Default without its hairline",
      render: () => <Demo variant="default" divider={false} />,
    },
    { name: "Pills. The SegmentedControl track", render: () => <Demo variant="pills" /> },
    { name: "Rail", render: () => <Demo variant="rail" /> },
  ],
};

export default entry;

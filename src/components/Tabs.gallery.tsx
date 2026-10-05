import type { GalleryEntry } from "./galleryEntry";
import { Tabs, type TabsVariant } from "./Tabs";

function Demo({ variant }: { variant: TabsVariant }) {
  return (
    <Tabs.Root defaultValue="games" className="w-96 gap-3">
      <Tabs.List variant={variant}>
        <Tabs.Tab variant={variant} value="games">
          Games
        </Tabs.Tab>
        <Tabs.Tab variant={variant} value="system">
          System
        </Tabs.Tab>
        <Tabs.Tab variant={variant} value="logs" disabled>
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
    { name: "Pills", render: () => <Demo variant="pills" /> },
  ],
};

export default entry;

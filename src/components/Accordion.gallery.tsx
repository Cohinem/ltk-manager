import { Accordion, type AccordionVariant } from "./Accordion";
import { Breadcrumb } from "./Breadcrumb";
import { Disclosure } from "./Disclosure";
import type { GalleryEntry } from "./galleryEntry";

const TRAIL = [
  { id: "data", label: "data" },
  { id: "characters", label: "characters" },
  { id: "fiora", label: "fiora" },
  { id: "skins", label: "skins" },
  { id: "skin0", label: "skin0.bin" },
];

function Demo({ variant }: { variant: AccordionVariant }) {
  return (
    <Accordion.Root variant={variant} defaultValue={["library"]} className="w-96">
      <Accordion.Item variant={variant} value="library">
        <Accordion.Trigger variant={variant}>Library</Accordion.Trigger>
        <Accordion.Panel variant={variant}>
          <p className="px-3 py-2 text-sm text-surface-400">Options for your mod library</p>
        </Accordion.Panel>
      </Accordion.Item>
      <Accordion.Item variant={variant} value="patcher">
        <Accordion.Trigger variant={variant}>Patcher</Accordion.Trigger>
        <Accordion.Panel variant={variant}>
          <p className="px-3 py-2 text-sm text-surface-400">Options for the overlay</p>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion.Root>
  );
}

const entry: GalleryEntry = {
  name: "Accordion",
  family: "navigation",
  cases: [
    { name: "Band", render: () => <Demo variant="band" /> },
    { name: "Filled", render: () => <Demo variant="filled" /> },
    {
      name: "Disclosure",
      render: () => (
        <Disclosure.Root>
          <Disclosure.Trigger className="flex items-center gap-1.5 rounded-sm text-sm text-surface-200">
            <Disclosure.Caret />
            Details
          </Disclosure.Trigger>
          <Disclosure.Panel className="pt-2 pl-5 text-sm text-surface-400">
            The panel mounts only while open.
          </Disclosure.Panel>
        </Disclosure.Root>
      ),
    },
    {
      name: "Breadcrumb",
      render: () => (
        <div className="flex flex-col gap-2">
          <Breadcrumb aria-label="Path" items={TRAIL.slice(2)} onNavigate={() => {}} />
          <Breadcrumb aria-label="Folded path" items={TRAIL} onNavigate={() => {}} maxVisible={3} />
        </div>
      ),
    },
  ],
};

export default entry;

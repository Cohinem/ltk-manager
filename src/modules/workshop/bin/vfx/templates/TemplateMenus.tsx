import { SparkleIcon } from "@phosphor-icons/react";

import { IconButton, Menu, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { VfxTemplate } from "@/lib/tauri";

import type { EmitterRef } from "../clipboard/emitterCopy";
import { useEmitterClipboard } from "../clipboard/useEmitterClipboard";
import type { AddChoice } from "../drivers/components/AddMenu";
import { useVfxTemplates } from "./templateQueries";
import { templateDescription, templateLabel } from "./templateText";

const POPUP = "max-h-96 w-72 overflow-y-auto";

/** Where a template lands: the system object, and the emitter it lands after, else last. */
export interface TemplatePlace {
  readonly entry: string;
  readonly after: EmitterRef | null;
}

/** Land `template` at `place`, and nothing where the document takes no edit. */
function useLand(place: TemplatePlace): ((template: VfxTemplate) => void) | null {
  const land = useEmitterClipboard()?.land ?? null;
  if (land === null || place.entry === "") return null;

  return (template) => void land(place.entry, place.after, template.emitters);
}

/** The emitter templates as quick add choices, each landing at `place`. */
export function useTemplateChoices(place: TemplatePlace): readonly AddChoice[] {
  const templates = useVfxTemplates("emitter");
  const land = useLand(place);
  if (land === null) return [];

  return templates.map((template) => ({
    key: `template:${template.id}`,
    text: templateLabel(template),
    pick: () => land(template),
  }));
}

/** The Graph menu's Add from template submenu, which lands after `place.after` or last. */
export function TemplateSubmenu({ place }: { place: TemplatePlace }) {
  const templates = useVfxTemplates("emitter");
  const land = useLand(place);
  if (land === null || templates.length === 0) return null;

  return (
    <Menu.SubmenuRoot>
      <Menu.SubmenuTrigger icon={<SparkleIcon />}>
        {m.workshop_bin_emitter_template_action()}
      </Menu.SubmenuTrigger>
      <Menu.Portal>
        <Menu.SubmenuPositioner>
          <Menu.Popup data-ui="TemplateSubmenu" className={POPUP}>
            <TemplateItems templates={templates} onPick={land} />
          </Menu.Popup>
        </Menu.SubmenuPositioner>
      </Menu.Portal>
    </Menu.SubmenuRoot>
  );
}

/** The inspector's Add from template button, whose menu lands after `place.after`. */
export function TemplateMenuButton({ place }: { place: TemplatePlace }) {
  const templates = useVfxTemplates("emitter");
  const land = useLand(place);
  if (land === null || templates.length === 0) return null;

  const label = m.workshop_bin_emitter_template_action();
  return (
    <Menu.Root>
      <Tooltip content={label}>
        <Menu.Trigger
          render={
            <IconButton
              variant="ghost"
              size="xs"
              aria-label={label}
              icon={<SparkleIcon weight="bold" className="h-4 w-4" />}
            />
          }
        />
      </Tooltip>
      <Menu.Portal>
        <Menu.Positioner>
          <Menu.Popup data-ui="TemplateMenuButton" className={POPUP}>
            <TemplateItems templates={templates} onPick={land} />
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function TemplateItems({
  templates,
  onPick,
}: {
  templates: readonly VfxTemplate[];
  onPick: (template: VfxTemplate) => void;
}) {
  return templates.map((template) => (
    <Menu.Item key={template.id} onClick={() => onPick(template)}>
      <span className="flex min-w-0 flex-col">
        <span>{templateLabel(template)}</span>
        <span className="text-meta text-surface-400">{templateDescription(template)}</span>
      </span>
    </Menu.Item>
  ));
}

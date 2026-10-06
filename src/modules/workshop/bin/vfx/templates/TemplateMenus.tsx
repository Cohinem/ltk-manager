import { SparkleIcon } from "@phosphor-icons/react";
import { use } from "react";

import { Menu } from "@/components";
import { m } from "@/i18n";
import type { VfxTemplate, VfxTemplateKind } from "@/lib/tauri";

import type { EmitterRef } from "../clipboard/emitterCopy";
import { useEmitterClipboard } from "../clipboard/useEmitterClipboard";
import type { AddChoice } from "../drivers/components/AddMenu";
import { VfxRunContext } from "../playback/state/run";
import { useVfxTemplates } from "./templateQueries";
import { templateRig } from "./templateRig";
import { templateDescription, templateLabel } from "./templateText";

const POPUP = "max-h-96 w-72 overflow-y-auto";

/** Where a template lands: the system object, and the emitter it lands after, else last. */
export interface TemplatePlace {
  readonly entry: string;
  readonly after: EmitterRef | null;
}

/**
 * Land a template at `place`, and nothing where the document takes no edit.
 *
 * A system template then carries the run on its own rig, unless the author or a context chose
 * the rig in hand. "The rig picks itself" in docs/plans/vfx-templates.md.
 */
function useLand(place: TemplatePlace): ((template: VfxTemplate) => void) | null {
  const land = useEmitterClipboard()?.land ?? null;
  const run = use(VfxRunContext);
  if (land === null || place.entry === "") return null;

  return (template) =>
    void land(place.entry, place.after, template.emitters).then((landed) => {
      if (!landed || template.rig === null || run === null) return;

      const held = run.rig.source.kind;
      if (held === "custom" || held === "context") return;

      run.setRig({
        source: { kind: "template", name: templateLabel(template) },
        rig: templateRig(template.rig),
      });
    });
}

/** The templates of `kind` as quick add choices, each landing at `place`. */
export function useTemplateChoices(
  place: TemplatePlace,
  kind: VfxTemplateKind,
): readonly AddChoice[] {
  const templates = useVfxTemplates(kind);
  const land = useLand(place);
  if (land === null) return [];

  return templates.map((template) => ({
    key: `template:${template.id}`,
    text: templateLabel(template),
    pick: () => land(template),
  }));
}

/**
 * The Add from template submenu of the Graph menu and of the inspector's Emitter menu, which
 * lands after `place.after` or last.
 */
export function TemplateSubmenu({ place }: { place: TemplatePlace }) {
  const emitters = useVfxTemplates("emitter");
  const systems = useVfxTemplates("system");
  const land = useLand(place);
  if (land === null || emitters.length + systems.length === 0) return null;

  return (
    <Menu.SubmenuRoot>
      <Menu.SubmenuTrigger icon={<SparkleIcon />}>
        {m.workshop_bin_emitter_template_action()}
      </Menu.SubmenuTrigger>
      <Menu.SubmenuContent data-ui="TemplateSubmenu" className={POPUP}>
        <TemplateGroups emitters={emitters} systems={systems} onPick={land} />
      </Menu.SubmenuContent>
    </Menu.SubmenuRoot>
  );
}

function TemplateGroups({
  emitters,
  systems,
  onPick,
}: {
  emitters: readonly VfxTemplate[];
  systems: readonly VfxTemplate[];
  onPick: (template: VfxTemplate) => void;
}) {
  return (
    <>
      <Menu.Group>
        <Menu.GroupLabel>{m.workshop_bin_graph_quick_templates_label()}</Menu.GroupLabel>
        <TemplateItems templates={emitters} onPick={onPick} />
      </Menu.Group>
      {systems.length > 0 && (
        <>
          <Menu.Separator />
          <Menu.Group>
            <Menu.GroupLabel>{m.workshop_bin_graph_quick_system_templates_label()}</Menu.GroupLabel>
            <TemplateItems templates={systems} onPick={onPick} />
          </Menu.Group>
        </>
      )}
    </>
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

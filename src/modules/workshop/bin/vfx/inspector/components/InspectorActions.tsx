import { CaretDownIcon, PlusIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";

import { Button, IconButton, Menu } from "@/components";
import { m } from "@/i18n";

import { ChangeMenuItems } from "../../../documents/components/ChangeMark";
import { useChangeViewStore } from "../../../documents/state/changeView";
import {
  useDefinedOnly,
  useInspectorPreview,
  useToggleDefinedOnly,
  useToggleInspectorPreview,
} from "../state/inspectorView";
import { EmitterActionsMenu } from "./EmitterActionsMenu";

/**
 * The inspector's actions, drawn before its property search: Add property, the View menu and
 * the Emitter menu. Per "The inspector's actions" in docs/ux/BIN_EDITOR.md.
 *
 * `adding` is whether the add box stands in for the search, and null where the emitter takes
 * no add.
 */
export function InspectorActions({
  adding,
  onAddingChange,
}: {
  adding: boolean | null;
  onAddingChange: (adding: boolean) => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label={m.workshop_bin_inspector_actions_label()}
      data-ui="InspectorActions"
      className="flex shrink-0 items-center gap-0.5"
    >
      {adding !== null && (
        <IconButton
          size="sm"
          pressed={adding}
          icon={<PlusIcon weight="bold" className="size-4" />}
          onClick={() => onAddingChange(!adding)}
          label={m.workshop_bin_inspector_add_action()}
        />
      )}
      <ViewMenu />
      <EmitterActionsMenu />
    </div>
  );
}

/**
 * What the inspector shows: only the defined properties, the emitter's preview, and the change
 * marks. Its button is pressed while a filter hides rows.
 */
function ViewMenu() {
  const definedOnly = useDefinedOnly();
  const toggleDefinedOnly = useToggleDefinedOnly();
  const preview = useInspectorPreview();
  const togglePreview = useToggleInspectorPreview();
  const changedOnly = useChangeViewStore((state) => state.changedOnly);

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            variant="ghost"
            size="xs"
            data-pressed={definedOnly || changedOnly || undefined}
            className="font-sans data-pressed:bg-accent-500/15 data-pressed:text-accent-300"
            left={<SlidersHorizontalIcon weight="bold" className="size-3.5" />}
            right={<CaretDownIcon weight="bold" className="size-3" />}
          >
            {m.workshop_bin_inspector_view_label()}
          </Button>
        }
      />
      <Menu.Content align="start" data-ui="InspectorViewMenu" className="w-48">
        <Menu.CheckboxItem checked={definedOnly} onCheckedChange={() => toggleDefinedOnly()}>
          {m.workshop_bin_inspector_defined_only_action()}
        </Menu.CheckboxItem>
        <Menu.CheckboxItem checked={preview} onCheckedChange={() => togglePreview()}>
          {m.workshop_bin_inspector_preview_action()}
        </Menu.CheckboxItem>
        <Menu.Separator />
        <ChangeMenuItems />
      </Menu.Content>
    </Menu.Root>
  );
}

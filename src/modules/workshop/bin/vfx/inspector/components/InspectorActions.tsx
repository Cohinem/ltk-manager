import { FunnelSimpleIcon, MonitorPlayIcon, PlusIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { IconButton } from "@/components";
import { m } from "@/i18n";

import { ChangesMenu } from "../../../documents/components/ChangeMark";
import {
  useDefinedOnly,
  useInspectorPreview,
  useToggleDefinedOnly,
  useToggleInspectorPreview,
} from "../state/inspectorView";
import { EmitterClipboardActions } from "./EmitterClipboardActions";

/**
 * The inspector's actions, drawn before its property search.
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
  const definedOnly = useDefinedOnly();
  const toggleDefinedOnly = useToggleDefinedOnly();
  const preview = useInspectorPreview();
  const togglePreview = useToggleInspectorPreview();

  return (
    <div
      role="toolbar"
      aria-label={m.workshop_bin_inspector_actions_label()}
      data-ui="InspectorActions"
      className="flex shrink-0 items-center gap-0.5"
    >
      <ActionToggle
        label={m.workshop_bin_inspector_defined_only_action()}
        pressed={definedOnly}
        onPress={toggleDefinedOnly}
      >
        <FunnelSimpleIcon weight="bold" className="size-4" />
      </ActionToggle>
      {adding !== null && (
        <ActionToggle
          label={m.workshop_bin_inspector_add_action()}
          pressed={adding}
          onPress={() => onAddingChange(!adding)}
        >
          <PlusIcon weight="bold" className="size-4" />
        </ActionToggle>
      )}
      <ActionToggle
        label={m.workshop_bin_inspector_preview_action()}
        pressed={preview}
        onPress={togglePreview}
      >
        <MonitorPlayIcon weight="bold" className="size-4" />
      </ActionToggle>
      <ChangesMenu />
      <EmitterClipboardActions />
    </div>
  );
}

function ActionToggle({
  label,
  pressed,
  onPress,
  children,
}: {
  label: string;
  pressed: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return <IconButton size="sm" pressed={pressed} icon={children} onClick={onPress} label={label} />;
}

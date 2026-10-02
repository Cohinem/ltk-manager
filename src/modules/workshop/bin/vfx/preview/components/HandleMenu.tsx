import {
  ArrowClockwiseIcon,
  ArrowsOutCardinalIcon,
  ArrowsOutIcon,
  ArrowUpRightIcon,
  CaretDownIcon,
  CrosshairIcon,
  HandGrabbingIcon,
  MapPinIcon,
} from "@phosphor-icons/react";

import { Button, Menu } from "@/components";
import { m } from "@/i18n";

import { HANDLE_KINDS, type HandleKind } from "../utils/spatialHandles";

const NONE = "none";

const HANDLE_LABEL: Record<HandleKind, () => string> = {
  offset: m.workshop_bin_handle_offset_label,
  turn: m.workshop_bin_handle_turn_label,
  position: m.workshop_bin_handle_position_label,
  emit: m.workshop_bin_handle_emit_label,
  size: m.workshop_bin_handle_size_label,
  velocity: m.workshop_bin_handle_velocity_label,
};

const HANDLE_ICON = {
  offset: ArrowsOutCardinalIcon,
  turn: ArrowClockwiseIcon,
  position: MapPinIcon,
  emit: CrosshairIcon,
  size: ArrowsOutIcon,
  velocity: ArrowUpRightIcon,
};

/**
 * The viewport's handle picker: which of the open emitter's spatial values the gizmo edits.
 *
 * A handle the emitter cannot take is listed disabled with the reason `blocked` gives, such
 * as a value animated over the emitter's life, whose curve edits it instead.
 */
export function HandleMenu({
  value,
  blocked,
  onChange,
}: {
  value: HandleKind | null;
  /** Why each handle is unavailable, and null for one the emitter takes. */
  blocked: (kind: HandleKind) => string | null;
  onChange: (kind: HandleKind | null) => void;
}) {
  const Icon = value === null ? HandGrabbingIcon : HANDLE_ICON[value];

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            variant="ghost"
            size="xs"
            compact
            aria-label={m.workshop_bin_handle_menu_label()}
            data-pressed={value !== null || undefined}
            className="data-pressed:bg-accent-500/15 data-pressed:text-accent-300"
            left={<Icon weight="bold" className="size-4" />}
            right={<CaretDownIcon weight="bold" className="size-3" />}
          />
        }
      />
      <Menu.Content align="end" data-ui="HandleMenu" className="w-60">
        <Menu.RadioGroup
          value={value ?? NONE}
          onValueChange={(each) => onChange(each === NONE ? null : (each as HandleKind))}
        >
          <Menu.RadioItem value={NONE}>{m.workshop_bin_handle_none_label()}</Menu.RadioItem>
          <Menu.Separator />
          {HANDLE_KINDS.map((kind) => {
            const reason = blocked(kind);
            const ItemIcon = HANDLE_ICON[kind];
            return (
              <Menu.RadioItem key={kind} value={kind} disabled={reason !== null}>
                <span className="flex min-w-0 items-center gap-2">
                  <ItemIcon weight="bold" className="size-3.5 shrink-0" />
                  <span className="flex min-w-0 flex-col">
                    {HANDLE_LABEL[kind]()}
                    {reason !== null && (
                      <span className="text-meta text-surface-500">{reason}</span>
                    )}
                  </span>
                </span>
              </Menu.RadioItem>
            );
          })}
        </Menu.RadioGroup>
      </Menu.Content>
    </Menu.Root>
  );
}

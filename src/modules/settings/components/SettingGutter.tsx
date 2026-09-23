import { ArrowCounterClockwiseIcon, CopyIcon, GearSixIcon, LinkIcon } from "@phosphor-icons/react";
import { type MouseEvent, type ReactNode, useState } from "react";

import { Menu } from "@/components";
import { useCopyToClipboard } from "@/hooks";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { type IndexedSettingKey, settingEntry, settingLink } from "../settingsIndex";
import { useSettingDefault } from "./SettingScope";

/** Positions the menu where the pointer was, for a right-click on the row. */
interface PointerAnchor {
  getBoundingClientRect: () => DOMRect;
}

interface SettingGutterProps {
  setting?: IndexedSettingKey;
  target?: { id: string; title: string };
  className?: string;
  children: ReactNode;
}

/**
 * The gear and the modified bar in the column left of one row.
 *
 * An explicit target provides copying for a section without a setting or reset state.
 */
export function SettingGutter({ setting, target, className, children }: SettingGutterProps) {
  const { resettable, changed, label, reset } = useSettingDefault(setting);
  const copy = useCopyToClipboard();
  const [open, setOpen] = useState(false);
  const [pointer, setPointer] = useState<PointerAnchor | null>(null);

  const entry = setting === undefined ? target : settingEntry(setting);
  const copyIdLabel =
    setting === undefined ? m.settings_target_id_label() : m.settings_property_id_label();
  const copyLinkLabel =
    setting === undefined ? m.settings_target_link_label() : m.settings_property_link_label();

  function openAtPointer(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const { clientX, clientY } = event;
    setPointer({ getBoundingClientRect: () => new DOMRect(clientX, clientY, 0, 0) });
    setOpen(true);
  }

  if (!entry) {
    return <div className={twMerge("relative", className)}>{children}</div>;
  }

  return (
    <Menu.Root open={open} onOpenChange={setOpen}>
      <div
        data-ui="SettingGutter"
        className={twMerge("group/setting relative", className)}
        onContextMenu={openAtPointer}
      >
        {changed && (
          <span
            aria-hidden
            data-ui="SettingGutter:modified"
            /* DS-SETTING-GUTTER. */
            className="absolute inset-y-0 -left-2 w-0.5 rounded-full bg-accent-500/50"
          />
        )}

        <Menu.Trigger
          /* Untabbed: 45 rows would otherwise double the page's tab order with a
             menu nobody opened. The keyboard path is a right-click on the row. */
          tabIndex={-1}
          aria-label={m.settings_target_actions_label({ name: entry.title })}
          onClick={() => setPointer(null)}
          className={twMerge(
            "absolute top-0.5 -left-7 flex h-5 w-5 items-center justify-center rounded-md",
            "text-surface-400 opacity-0 transition-opacity hover:bg-surface-veil hover:text-surface-200",
            "group-focus-within/setting:opacity-100 group-hover/setting:opacity-100",
            "data-[popup-open]:opacity-100",
          )}
        >
          <GearSixIcon className="h-3.5 w-3.5" />
        </Menu.Trigger>

        {children}
      </div>

      <Menu.Portal>
        <Menu.Positioner side="bottom" align="start" anchor={pointer ?? undefined}>
          <Menu.Popup>
            {resettable && (
              <Menu.Item
                disabled={!changed}
                icon={<ArrowCounterClockwiseIcon className="h-4 w-4" />}
                onClick={reset}
              >
                {m.settings_property_reset_action()}
              </Menu.Item>
            )}
            {label && (
              <div className="px-2 pt-1 pb-0.5 text-xs text-surface-400 select-none">
                {m.settings_property_default_label({ value: label })}
              </div>
            )}
            {resettable && <Menu.Separator />}
            <Menu.Item
              icon={<CopyIcon className="h-4 w-4" />}
              onClick={() => void copy(entry.id, copyIdLabel)}
            >
              {setting === undefined && m.settings_target_copy_id_action()}
              {setting !== undefined && m.settings_property_copy_id_action()}
            </Menu.Item>
            <Menu.Item
              icon={<LinkIcon className="h-4 w-4" />}
              onClick={() => void copy(settingLink(entry.id), copyLinkLabel)}
            >
              {setting === undefined && m.settings_target_copy_link_action()}
              {setting !== undefined && m.settings_property_copy_link_action()}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

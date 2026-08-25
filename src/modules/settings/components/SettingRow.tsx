import { type ReactNode } from "react";
import { twMerge } from "tailwind-merge";

import { HintIcon } from "@/components";

import type { SettingKey } from "../settingKey";
import { useMarkRedirect, useSettingMark } from "./SettingFocus";
import { useSettingGroup } from "./SettingGroup";
import { SettingGutter } from "./SettingGutter";
import { useRegisterSetting } from "./SettingScope";

interface SettingRowProps {
  /** A string, because the gear's menu names the row out of it. */
  title: string;
  /** The setting this row reads. It is also the row's anchor id and its reset scope. */
  setting?: SettingKey;
  /** A glyph before the title, for a row about one part of the game. */
  icon?: ReactNode;
  /** A chip after the title. `ExperimentalChip` and its kind. */
  badge?: ReactNode;
  /** Omit when the control already says what it does, such as a segmented picker. */
  description?: ReactNode;
  /** Detail that would crowd the description, shown on the title's hint icon. */
  hint?: ReactNode;
  control: ReactNode;
  /** Sizes the control slot, for a control with no width of its own. */
  controlClassName?: string;
  /** An `action` row holds a button, so it must not be a label. Defaults to `toggle`. */
  kind?: "toggle" | "action";
  /** `stacked` drops a full-width control under the label, for an editor the right slot cannot hold. */
  layout?: "inline" | "stacked";
  /** Indents, for a setting only the row above it reaches. */
  dependent?: boolean;
  /** A dependent row its parent has turned off. It stays mounted and draws nothing. */
  hidden?: boolean;
}

/** One labelled setting and its control, across the row from it or beneath it. */
export function SettingRow({
  title,
  setting,
  icon,
  badge,
  description,
  hint,
  control,
  controlClassName,
  kind = "toggle",
  layout = "inline",
  dependent = false,
  hidden = false,
}: SettingRowProps) {
  const group = useSettingGroup();
  const mark = useSettingMark(setting, !hidden);
  useMarkRedirect(setting, group?.id, hidden);
  useRegisterSetting(setting, hidden);

  if (hidden) return null;

  const stacked = layout === "stacked";

  const className = twMerge(
    stacked ? "flex flex-col gap-2" : "flex items-center justify-between gap-4",
    "scroll-mt-6 outline-none",
    mark.className,
  );

  const body = (
    <>
      <div className="max-w-xl min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium text-surface-200">
          {icon}
          {title}
          {hint && <HintIcon content={hint} />}
          {badge}
        </span>
        {description && <span className="block text-sm text-surface-400">{description}</span>}
      </div>
      <div className={twMerge(stacked ? "min-w-0" : "shrink-0", controlClassName)}>{control}</div>
    </>
  );

  let row: ReactNode = (
    <label ref={mark.ref} tabIndex={mark.tabIndex} className={className}>
      {body}
    </label>
  );

  /* A stacked control is composite, so a wrapping label would aim every click at its first input. */
  if (kind === "action" || stacked) {
    row = (
      <div ref={mark.ref} tabIndex={mark.tabIndex} className={className}>
        {body}
      </div>
    );
  }

  return (
    <SettingGutter setting={setting} className={dependent ? "ml-4" : undefined}>
      {row}
    </SettingGutter>
  );
}

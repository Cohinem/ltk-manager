import { type ReactNode } from "react";

import { SettingScope } from "./SettingScope";

interface SettingRowsProps {
  children: ReactNode;
}

/** The rows of a card that has no groups, at the rhythm a group would set. */
export function SettingRows({ children }: SettingRowsProps) {
  return (
    <SettingScope>
      {/* DS-SETTING-GUTTER. */}
      <div className="flex flex-col gap-3 pl-7">{children}</div>
    </SettingScope>
  );
}

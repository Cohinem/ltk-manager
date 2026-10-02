import { SegmentedControl } from "@/components";

import { useLoadedSettings, useUpdateSettings } from "../../api";

type Theme = "system" | "dark" | "light";

const THEMES: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

export function ThemePicker() {
  const settings = useLoadedSettings();
  const update = useUpdateSettings();
  return (
    <SegmentedControl
      options={THEMES}
      value={(settings.theme ?? "system") as Theme}
      onChange={(theme) => update({ theme })}
    />
  );
}

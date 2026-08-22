import { Select } from "@/components";
import type { MonoFont, SansFont } from "@/stores";
import { useMonoFont, useSansFont, useSetMonoFont, useSetSansFont } from "@/stores";

const SANS_OPTIONS: { value: SansFont; label: string }[] = [
  { value: "geist", label: "Geist" },
  { value: "inter", label: "Inter" },
  { value: "plex", label: "IBM Plex Sans" },
  { value: "nunito", label: "Nunito Sans" },
];

const MONO_OPTIONS: { value: MonoFont; label: string }[] = [
  { value: "geist", label: "Geist Mono" },
  { value: "jetbrains", label: "JetBrains Mono" },
  { value: "fira", label: "Fira Code" },
];

export function InterfaceFontPicker() {
  const sansFont = useSansFont();
  const setSansFont = useSetSansFont();

  return (
    <Select.Root
      value={sansFont}
      onValueChange={(value) => value && setSansFont(value as SansFont)}
    >
      <Select.Trigger className="w-52">
        <Select.Value>
          {(current) => SANS_OPTIONS.find((option) => option.value === current)?.label ?? ""}
        </Select.Value>
        <Select.Icon />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner>
          <Select.Popup>
            {SANS_OPTIONS.map(({ value, label }) => (
              /* The attribute redefines --face-sans for this row alone, so the
                 name is drawn in the face it names. */
              <Select.Item key={value} value={value} data-font-sans={value} className="font-sans">
                {label}
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

export function CodeFontPicker() {
  const monoFont = useMonoFont();
  const setMonoFont = useSetMonoFont();

  return (
    <Select.Root
      value={monoFont}
      onValueChange={(value) => value && setMonoFont(value as MonoFont)}
    >
      <Select.Trigger className="w-52">
        <Select.Value>
          {(current) => MONO_OPTIONS.find((option) => option.value === current)?.label ?? ""}
        </Select.Value>
        <Select.Icon />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner>
          <Select.Popup>
            {MONO_OPTIONS.map(({ value, label }) => (
              <Select.Item key={value} value={value} data-font-mono={value} className="font-mono">
                {label}
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

import { SegmentedControl, Select, TogglePill } from "@/components";

import {
  ACCENT_CONDITIONS,
  type Conditions,
  type Ground,
  type ThemeCondition,
} from "../conditions";

const THEMES: Array<{ value: ThemeCondition; label: string }> = [
  { value: "app", label: "App" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

const GROUNDS: Array<{ value: Ground; label: string }> = [
  { value: "950", label: "950" },
  { value: "900", label: "900" },
  { value: "800", label: "800" },
];

interface ConditionBarProps {
  conditions: Conditions;
  onConditionsChange: (conditions: Conditions) => void;
  ground: Ground;
  onGroundChange: (ground: Ground) => void;
}

/** The switches for the conditions a component has to pass, and the ground its cases sit on. */
export function ConditionBar({
  conditions,
  onConditionsChange,
  ground,
  onGroundChange,
}: ConditionBarProps) {
  return (
    <>
      <SegmentedControl
        size="xs"
        aria-label="Theme"
        options={THEMES}
        value={conditions.theme}
        onChange={(theme) => onConditionsChange({ ...conditions, theme })}
      />

      <Select.Root
        value={conditions.accent}
        onValueChange={(accent) => {
          if (accent !== null) onConditionsChange({ ...conditions, accent });
        }}
      >
        <Select.Trigger aria-label="Accent" size="sm" className="w-40">
          <Select.Value prefix="Accent" />
          <Select.Icon />
        </Select.Trigger>
        <Select.Content>
          {ACCENT_CONDITIONS.map((accent) => (
            <Select.Item key={accent} value={accent}>
              {accent}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>

      <TogglePill
        label="Tint 0"
        active={conditions.zeroTint}
        onClick={() => onConditionsChange({ ...conditions, zeroTint: !conditions.zeroTint })}
      />
      <TogglePill
        label="Reduce motion"
        active={conditions.reduceMotion}
        onClick={() =>
          onConditionsChange({ ...conditions, reduceMotion: !conditions.reduceMotion })
        }
      />

      <SegmentedControl
        size="xs"
        aria-label="Ground"
        options={GROUNDS}
        value={ground}
        onChange={onGroundChange}
      />
    </>
  );
}

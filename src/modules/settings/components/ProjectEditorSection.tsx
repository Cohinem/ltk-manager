import { TabsIcon } from "@phosphor-icons/react";

import { SectionCard, SegmentedControl, Separator, Switch } from "@/components";
import {
  useForwardLookingMeta,
  useSearchGame,
  useSetForwardLookingMeta,
  useSetSearchGame,
  useSetTabOpenMode,
  useTabOpenMode,
} from "@/stores";

import { SettingRow } from "./SettingRow";

const TAB_OPEN_OPTIONS = [
  { value: "append" as const, label: "New tab" },
  { value: "replace" as const, label: "Reuse tab" },
];

export function ProjectEditorSection() {
  const tabOpenMode = useTabOpenMode();
  const setTabOpenMode = useSetTabOpenMode();
  const searchGame = useSearchGame();
  const setSearchGame = useSetSearchGame();
  const forwardLookingMeta = useForwardLookingMeta();
  const setForwardLookingMeta = useSetForwardLookingMeta();

  return (
    <SectionCard
      title="Project editor"
      icon={<TabsIcon className="h-5 w-5" />}
      description="Options for the editor you open a project in"
    >
      <SettingRow
        title="Opening a file"
        description="Reusing keeps one tab and swaps what it holds, so a walk through a directory stays one tab wide."
        control={
          <SegmentedControl
            options={TAB_OPEN_OPTIONS}
            value={tabOpenMode}
            onChange={setTabOpenMode}
          />
        }
      />

      <Separator />

      <SettingRow
        title="Search the game"
        description="The project bar reads every file of the install alongside your own."
        hint="The first search of a session indexes every archive, which takes a moment. Your project, layers, strings and commands are searched either way."
        control={<Switch checked={searchGame} onCheckedChange={setSearchGame} />}
      />

      <Separator />

      <SettingRow
        title="Forward-looking Meta Linter"
        description="Makes the Problems tab in the editor show lints for future Meta changes"
        hint="Riot changes the declared type of bin properties from one game build to the next. These lints are about a build your game has not taken yet, so Problems draws them muted and leaves them out of the count beside Test. Repairing one before that build lands breaks the mod on the client you have."
        control={<Switch checked={forwardLookingMeta} onCheckedChange={setForwardLookingMeta} />}
      />
    </SectionCard>
  );
}

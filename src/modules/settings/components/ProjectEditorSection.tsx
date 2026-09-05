import { TabsIcon } from "@phosphor-icons/react";

import { SectionCard, SegmentedControl, Separator, Switch } from "@/components";
import {
  useForwardLookingMeta,
  useSearchGame,
  useSearchObjects,
  useSetForwardLookingMeta,
  useSetSearchGame,
  useSetSearchObjects,
  useSetTabOpenMode,
  useTabOpenMode,
} from "@/stores";

import { SettingRow } from "./SettingRow";
import { SettingRows } from "./SettingRows";

const TAB_OPEN_OPTIONS = [
  { value: "append" as const, label: "New tab" },
  { value: "replace" as const, label: "Reuse tab" },
];

export function ProjectEditorSection() {
  const tabOpenMode = useTabOpenMode();
  const setTabOpenMode = useSetTabOpenMode();
  const searchGame = useSearchGame();
  const setSearchGame = useSetSearchGame();
  const searchObjects = useSearchObjects();
  const setSearchObjects = useSetSearchObjects();
  const forwardLookingMeta = useForwardLookingMeta();
  const setForwardLookingMeta = useSetForwardLookingMeta();

  return (
    <SectionCard
      title="Project editor"
      icon={<TabsIcon className="h-5 w-5" />}
      description="Options for the editor you open a project in"
    >
      <SettingRows>
        <SettingRow
          setting="layout.tabOpenMode"
          description="Reusing keeps one tab and swaps what it holds, so a walk through a directory stays one tab wide."
          control={
            <SegmentedControl
              options={TAB_OPEN_OPTIONS}
              value={tabOpenMode}
              onChange={setTabOpenMode}
            />
          }
        />

        <Separator className="my-0" />

        <SettingRow
          setting="layout.searchGame"
          description="The project bar reads every file of the install alongside your own."
          hint="The first search of a session indexes every archive, which takes a moment. Your project, layers, strings and commands are searched either way."
          control={<Switch checked={searchGame} onCheckedChange={setSearchGame} />}
        />

        <Separator className="my-0" />

        <SettingRow
          setting="layout.searchObjects"
          description="The project bar reads every bin object the install declares."
          hint="Building the index reads every bin of the install once a session, after the game index, and takes a few seconds."
          control={<Switch checked={searchObjects} onCheckedChange={setSearchObjects} />}
        />

        <Separator className="my-0" />

        <SettingRow
          setting="layout.forwardLookingMeta"
          description="Lists what a coming patch will break, dimmed, alongside what is wrong today."
          hint="Riot changes how bin files store some of their values from one patch to the next. These findings are about a patch your game has not taken yet, so Problems dims them and leaves them out of the count beside Test, and repairing one early breaks the mod on the patch you play. Problems carries the same switch under its filter box whenever a project has some, which is the quicker way to turn them off for one sitting."
          control={<Switch checked={forwardLookingMeta} onCheckedChange={setForwardLookingMeta} />}
        />
      </SettingRows>
    </SectionCard>
  );
}

import { ArrowLeftIcon, PlayIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";

import { Button, Field } from "@/components";
import { errorSummary, m } from "@/i18n";
import type { AssetRef } from "@/lib/tauri";

import { useWarmOnAbsent } from "../../../objectsBrowser/api/useObjectIndex";
import { readyValue } from "../../../shared/api/indexQueries";
import { usePaneCommands } from "../../menus/state/paneCommands";
import { Notice } from "../../shared/preview/Notice";
import {
  listCommands,
  SPELL_BACK_COMMAND,
  SPELL_FILTER_COMMAND,
  SPELL_PICK_LIST,
} from "../../skin/utils/skinCommands";
import { spellQueries } from "../api/spellQueries";
import type { AbilityRecipe } from "../utils/abilityRecipe";
import { characterOf, spellGroups } from "../utils/catalog";
import { AbilityLibrary, type AbilitySource } from "./AbilityLibrary";
import { MissilePane, type SkinSource } from "./MissilePane";
import type { SpellSelection } from "./SpellRecipe";

/** The current character's spell previews. */
export function SpellsPane({
  objectPath,
  skin,
  abilitySource,
  onAbilityPreview,
}: {
  readonly objectPath: string | null;
  readonly skin?: SkinSource;
  readonly abilitySource?: AbilitySource;
  readonly onAbilityPreview?: (recipe: AbilityRecipe | null) => void;
}) {
  const character = objectPath === null ? null : characterOf(objectPath);
  if (character === null) return <Notice text={m.workshop_spells_character_empty()} />;
  if (abilitySource !== undefined && onAbilityPreview !== undefined)
    return (
      <AbilityLibrary
        key={`${character.toLowerCase()}:${abilitySource.entry}`}
        character={character}
        source={abilitySource}
        onPreview={onAbilityPreview}
      >
        {(onSelect) => <CharacterSpells character={character} skin={skin} onSelect={onSelect} />}
      </AbilityLibrary>
    );
  return <CharacterSpells key={character.toLowerCase()} character={character} skin={skin} />;
}

function CharacterSpells({
  character,
  skin,
  onSelect,
}: {
  readonly character: string;
  readonly skin?: SkinSource;
  readonly onSelect?: (spell: SpellSelection) => void;
}) {
  const read = useQuery(spellQueries.catalog(character));
  const warm = useWarmOnAbsent(read.data?.status);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<{ asset: AssetRef; entry: string; name: string } | null>(
    null,
  );
  const spells = readyValue(read.data)?.spells;
  const available = useQuery(spellQueries.availability(spells ?? [], onSelect !== undefined));
  const groups = useMemo(() => spellGroups(spells ?? [], filter), [spells, filter]);
  const filterField = useRef<HTMLInputElement>(null);
  const missile = selected !== null && skin !== undefined;
  const hintOf = (spell: (typeof groups)[number]["spells"][number]) => {
    const status = available.data?.[spell.objectHash];
    if (status === undefined && !available.isError) return m.workshop_spells_checking_label();
    if (status === "ambiguous") return m.workshop_spells_ambiguous_label();
    if (status === "unavailable" || available.isError) return m.workshop_spells_unavailable_label();

    return m.workshop_spells_unsupported_label();
  };
  const supportedSpell = (spell: (typeof groups)[number]["spells"][number]) =>
    available.data?.[spell.objectHash] === "supported" && skin !== undefined;
  const pick = (spell: (typeof groups)[number]["spells"][number]) => {
    if (!supportedSpell(spell)) return;

    (onSelect ?? setSelected)({
      asset: spell.declarations[0].asset,
      entry: spell.objectHash,
      name: spell.name,
    });
  };

  usePaneCommands("spells.list", {
    [SPELL_FILTER_COMMAND]: {
      run:
        missile || read.data?.status !== "ready"
          ? null
          : () => requestAnimationFrame(() => filterField.current?.focus()),
      reason: m.workshop_bin_menu_skin_spell_list_reason(),
    },
    [SPELL_BACK_COMMAND]: missile ? { run: () => setSelected(null) } : undefined,
    ...listCommands(
      SPELL_PICK_LIST,
      missile
        ? []
        : groups.flatMap((group) =>
            group.spells.map((spell) => {
              const supported = supportedSpell(spell);

              return {
                title: spell.name.split("/").at(-1),
                run: supported ? () => pick(spell) : null,
                reason: supported ? undefined : hintOf(spell),
              };
            }),
          ),
    ),
  });

  if (selected !== null && skin !== undefined)
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-surface-700/40 px-3 py-2">
          <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
            <ArrowLeftIcon className="size-3.5" />
            {m.workshop_missile_back_action()}
          </Button>
          <span title={selected.name} className="truncate text-sm font-medium text-surface-100">
            {selected.name.split("/").at(-1)}
          </span>
        </div>
        <MissilePane asset={selected.asset} entry={selected.entry} skin={skin} />
      </div>
    );

  if (read.error !== null || read.data?.status === "failed") {
    const error = read.error ?? (read.data?.status === "failed" ? read.data.error : null);
    return (
      <div data-ui="SpellsPane:error" className="flex flex-col items-start gap-2 p-3 text-meta">
        <p className="text-danger-text">{m.workshop_objects_index_failed_title()}</p>
        {error !== null && <p className="text-surface-300 select-text">{errorSummary(error)}</p>}
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (read.data?.status === "failed") warm();
            else void read.refetch();
          }}
        >
          {m.workshop_objects_retry_action()}
        </Button>
      </div>
    );
  }
  if (read.data?.status !== "ready") {
    return <Notice text={m.workshop_spells_loading_label()} />;
  }

  return (
    <div data-ui="SpellsPane" className="flex min-h-0 flex-1 flex-col select-none">
      <div className="flex shrink-0 flex-col gap-2 border-b border-surface-700/50 p-2">
        <Field.Control
          ref={filterField}
          aria-label={m.workshop_spells_filter_label()}
          placeholder={m.workshop_spells_filter_placeholder()}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          size="sm"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2 scrollbar-md">
        {groups.length === 0 && (
          <p className="text-meta text-surface-400">{m.workshop_spells_matches_empty()}</p>
        )}
        {groups.map((group) => (
          <section key={group.name ?? ""} className="flex flex-col gap-1 pb-2">
            <h3 className="px-2 text-meta font-medium text-surface-400">
              {group.name ?? m.workshop_spells_ungrouped_label()}
            </h3>
            {group.spells.map((spell) => {
              const supported = supportedSpell(spell);
              const hint = hintOf(spell);
              return (
                <Button
                  key={spell.objectHash}
                  variant="ghost"
                  size="sm"
                  disabled={!supported}
                  className="h-8 w-full justify-between gap-3 rounded-none px-2 text-left disabled:opacity-60"
                  onClick={() => pick(spell)}
                >
                  <span className="min-w-0 truncate">{spell.name.split("/").at(-1)}</span>
                  {supported && (
                    <PlayIcon weight="duotone" className="size-3.5 shrink-0 text-surface-400" />
                  )}
                  {!supported && (
                    <span className="shrink-0 text-meta text-surface-400">{hint}</span>
                  )}
                </Button>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}

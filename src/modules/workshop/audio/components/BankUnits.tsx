import { ArrowElbowDownRightIcon, CaretDownIcon, StackIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { Button, Menu, Tooltip } from "@/components";
import { m } from "@/i18n";
import { useAssetVersion } from "@/lib/assetVersions";
import type {
  AssetRef,
  BankDeclaration,
  BankReferencesResponse,
  BankUnitGroup,
  SetFile,
  SiteRow,
} from "@/lib/tauri";

import { useOptionalProjectContext } from "../../projects/state/ProjectContext";
import { useSandbox } from "../../sandbox/state/SandboxContext";
import { audioQueries } from "../api/queries";
import { useOpenSetFile, useOpenSiteRow } from "../hooks/useOpenSiteRow";
import { fileName, type UnitFileKind, unitFileKind, unitsTrigger } from "../utils/bankUnits";

interface BankUnitMenuProps {
  readonly asset: AssetRef;
}

const KIND_LABELS: Record<UnitFileKind, () => string> = {
  eventBank: m.audio_units_event_bank_label,
  mediaBank: m.audio_units_media_bank_label,
  package: m.audio_units_package_label,
};

/**
 * The toolbar button that names the bank units of an audio file, over a menu of their files and
 * declarations.
 *
 * Each unit is a group: its files, which open their audio documents, and a submenu of the bins
 * that declare it, which open the object at the `BankUnit` row. The links need a project, which
 * owns the editor tabs. The menu reads before the game's audio index is ready and polls until it
 * is. Per "Bank units" in docs/ux/AUDIO.md.
 */
export function BankUnitMenu({ asset }: BankUnitMenuProps) {
  const sandbox = useSandbox();
  const version = useAssetVersion(asset);
  const references = useQuery(audioQueries.references(sandbox, asset, version));
  const linked = useOptionalProjectContext() !== null;
  const data = references.data;
  const label = triggerLabel(data);

  return (
    <Menu.Root>
      <Tooltip content={m.audio_units_title()}>
        <Menu.Trigger
          data-ui="BankUnitMenu"
          render={
            <Button
              variant="ghost"
              size="xs"
              className="min-w-0 shrink"
              loading={data === undefined && references.error === null}
              left={<StackIcon weight="bold" />}
              right={<CaretDownIcon weight="bold" className="size-3" />}
            />
          }
        >
          <span className="max-w-48 truncate">{label}</span>
        </Menu.Trigger>
      </Tooltip>
      <Menu.Content align="end" sideOffset={4} className="max-h-[60vh] w-80 overflow-y-auto">
        {data === undefined && (
          <UnitsNote>
            {references.error ? m.audio_units_failed_empty() : m.audio_units_loading_label()}
          </UnitsNote>
        )}
        {data !== undefined && <UnitsMenuBody data={data} linked={linked} />}
      </Menu.Content>
    </Menu.Root>
  );
}

/** Returns the trigger's text: the first unit name, the count of the others, or the title. */
function triggerLabel(data: BankReferencesResponse | undefined): string {
  const trigger = data === undefined ? null : unitsTrigger(data.units);
  if (trigger === null) return m.audio_units_title();
  if (trigger.more === 0) return trigger.name;
  return m.audio_units_trigger_more_label({ name: trigger.name, more: String(trigger.more) });
}

/** The groups of the units, then the bank lists, or the line that stands in for them. */
function UnitsMenuBody({ data, linked }: { data: BankReferencesResponse; linked: boolean }) {
  const building = data.index.status === "building";
  const empty = data.units.length === 0 && data.lists.length === 0;

  return (
    <>
      {building && <UnitsNote>{m.audio_units_index_building_description()}</UnitsNote>}
      {empty && !building && <UnitsNote>{m.audio_units_empty()}</UnitsNote>}
      {data.units.map((group, at) => (
        <UnitGroup key={groupKey(group)} group={group} linked={linked} first={at === 0} />
      ))}
      {data.lists.length > 0 && (
        <>
          {data.units.length > 0 && <Menu.Separator />}
          <Menu.SubmenuRoot>
            <Menu.SubmenuTrigger>
              {m.audio_units_lists_label({ count: data.lists.length })}
            </Menu.SubmenuTrigger>
            <Menu.SubmenuContent className="max-h-[60vh] max-w-md overflow-y-auto">
              {data.lists.map((row) => (
                <RowItem key={rowKeyOf(row)} row={row} linked={linked} />
              ))}
            </Menu.SubmenuContent>
          </Menu.SubmenuRoot>
        </>
      )}
    </>
  );
}

/** A line of the menu that the app wrote: its state while it reads, builds or finds nothing. */
function UnitsNote({ children }: { children: ReactNode }) {
  return <p className="px-2 py-1.5 text-meta text-surface-400 select-none">{children}</p>;
}

function groupKey(group: BankUnitGroup): string {
  return `${group.name}:${group.files.map((file) => file.path).join("|")}`;
}

function rowKeyOf(row: SiteRow): string {
  return `${row.bin}:${row.objectHash}:${row.property?.path ?? ""}`;
}

interface UnitGroupProps {
  readonly group: BankUnitGroup;
  readonly linked: boolean;
  readonly first: boolean;
}

/** One group of bank units: its name, its files, and a submenu of its declarations. */
function UnitGroup({ group, linked, first }: UnitGroupProps) {
  const name = group.voiceOver
    ? m.audio_units_voice_over_name_label({ name: group.name })
    : group.name;

  return (
    <>
      {!first && <Menu.Separator />}
      <Menu.Group>
        <Menu.GroupLabel className="tracking-normal normal-case">{name}</Menu.GroupLabel>
        {group.files.map((file) => (
          <UnitFileItem key={file.path} file={file} linked={linked} />
        ))}
        {group.declarations.length > 0 && (
          <Menu.SubmenuRoot>
            <Menu.SubmenuTrigger>
              {m.audio_units_declarations_label({ count: group.declarations.length })}
            </Menu.SubmenuTrigger>
            <Menu.SubmenuContent className="max-h-[60vh] max-w-md overflow-y-auto">
              {group.declarations.map((declaration) => (
                <DeclarationItems
                  key={rowKeyOf(declaration.row)}
                  declaration={declaration}
                  linked={linked}
                />
              ))}
            </Menu.SubmenuContent>
          </Menu.SubmenuRoot>
        )}
      </Menu.Group>
    </>
  );
}

/**
 * One file of a unit: the opened file marked, a found file an item that opens it, and a missing
 * file disabled.
 */
function UnitFileItem({ file, linked }: { file: SetFile; linked: boolean }) {
  const openFile = useOpenSetFile();
  const label = `${KIND_LABELS[unitFileKind(file.path)]()}: ${fileName(file.path)}`;

  if (file.opened) {
    return <Menu.Item disabled>{m.audio_units_opened_file_label({ file: label })}</Menu.Item>;
  }
  if (file.state.kind === "missing" || file.asset === null) {
    return <Menu.Item disabled>{m.audio_units_missing_file_label({ file: label })}</Menu.Item>;
  }
  return (
    <Menu.Item disabled={!linked} onClick={() => openFile(file)}>
      {label}
    </Menu.Item>
  );
}

/** One bin that declares a unit, and the contextual actions that its holder links. */
function DeclarationItems({
  declaration,
  linked,
}: {
  declaration: BankDeclaration;
  linked: boolean;
}) {
  const openRow = useOpenSiteRow();
  const contextual = declaration.contextual;

  return (
    <>
      <RowItem row={declaration.row} linked={linked} />
      {contextual !== null && (
        <Menu.Item
          icon={<ArrowElbowDownRightIcon className="size-4" />}
          disabled={!linked || contextual.asset === null}
          onClick={() => openRow(contextual)}
        >
          {m.audio_units_open_contextual_action()}
        </Menu.Item>
      )}
    </>
  );
}

/** A bin and the row of it, as an item that opens the object at the row. */
function RowItem({ row, linked }: { row: SiteRow; linked: boolean }) {
  const openRow = useOpenSiteRow();
  const label = row.property?.label ?? row.object;

  return (
    <Menu.Item
      disabled={!linked || row.asset === null}
      onClick={() => openRow(row)}
      aria-label={m.audio_units_open_row_label({ bin: row.bin, row: label })}
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{row.bin}</span>
        <span className="truncate text-meta text-surface-400">{label}</span>
      </span>
    </Menu.Item>
  );
}

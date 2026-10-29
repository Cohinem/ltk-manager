import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { Badge, Button, Disclosure, Inline, OVERLINE, Stack } from "@/components";
import { m } from "@/i18n";
import { useAssetVersion } from "@/lib/assetVersions";
import type { AssetRef, BankDeclaration, BankUnitGroup, SetFile, SiteRow } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { useOptionalProjectContext } from "../../projects/state/ProjectContext";
import { useSandbox } from "../../sandbox/state/SandboxContext";
import { audioQueries } from "../api/queries";
import { useOpenSetFile, useOpenSiteRow } from "../hooks/useOpenSiteRow";
import { fileName, type UnitFileKind, unitFileKind } from "../utils/bankUnits";

interface BankUnitsProps {
  readonly asset: AssetRef;
}

const KIND_LABELS: Record<UnitFileKind, () => string> = {
  eventBank: m.audio_units_event_bank_label,
  mediaBank: m.audio_units_media_bank_label,
  package: m.audio_units_package_label,
};

/**
 * The bank units that name an audio file, each with its files and the bins that declare it.
 *
 * A found file other than the opened one opens its audio document, and a declaration opens its
 * object at the `BankUnit` row. The links need a project, which owns the editor tabs. The
 * section reads before the game's audio index is ready and polls until it is. Per "Bank units"
 * in docs/ux/AUDIO.md.
 */
export function BankUnits({ asset }: BankUnitsProps) {
  const sandbox = useSandbox();
  const version = useAssetVersion(asset);
  const references = useQuery(audioQueries.references(sandbox, asset, version));
  const linked = useOptionalProjectContext() !== null;

  const data = references.data;
  if (data === undefined) {
    const line = references.error ? m.audio_units_failed_empty() : m.audio_units_loading_label();
    return (
      <Stack as="section" gap={2} data-ui="BankUnits">
        <h3 className={twMerge(OVERLINE, "select-none")}>{m.audio_units_title()}</h3>
        <UnitsNote>{line}</UnitsNote>
      </Stack>
    );
  }

  const building = data.index.status === "building";
  const empty = data.units.length === 0 && data.lists.length === 0;

  return (
    <Stack as="section" gap={2} data-ui="BankUnits">
      <h3 className={twMerge(OVERLINE, "select-none")}>{m.audio_units_title()}</h3>
      {building && <UnitsNote>{m.audio_units_index_building_description()}</UnitsNote>}
      {empty && !building && <UnitsNote>{m.audio_units_empty()}</UnitsNote>}
      {data.units.map((group) => (
        <UnitGroup key={groupKey(group)} group={group} linked={linked} />
      ))}
      {data.lists.length > 0 && (
        <Stack gap={0.5}>
          <span className="text-meta text-surface-400 select-none">
            {m.audio_units_lists_label({ count: data.lists.length })}
          </span>
          {data.lists.map((row) => (
            <RowLink key={rowKeyOf(row)} row={row} linked={linked} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

/** A line of the section that the app wrote: its state while it reads, builds or finds nothing. */
function UnitsNote({ children }: { children: ReactNode }) {
  return <p className="text-meta text-surface-400 select-none">{children}</p>;
}

function groupKey(group: BankUnitGroup): string {
  return `${group.name}:${group.files.map((file) => file.path).join("|")}`;
}

function rowKeyOf(row: SiteRow): string {
  return `${row.bin}:${row.objectHash}:${row.property?.path ?? ""}`;
}

/** One group of bank units: its name, its files, and a disclosure with its declarations. */
function UnitGroup({ group, linked }: { group: BankUnitGroup; linked: boolean }) {
  return (
    <Disclosure.Root>
      <Stack gap={1}>
        <Inline gap={1.5} wrap align="center">
          <span className="font-medium text-surface-100 select-text">{group.name}</span>
          {group.voiceOver && <Badge size="sm">{m.audio_units_voice_over_label()}</Badge>}
          {group.files.map((file) => (
            <UnitFile key={file.path} file={file} linked={linked} />
          ))}
        </Inline>
        <Disclosure.Trigger className="flex w-fit items-center gap-1 text-meta text-surface-400 select-none">
          <Disclosure.Caret />
          {m.audio_units_declarations_label({ count: group.declarations.length })}
        </Disclosure.Trigger>
        <Disclosure.Panel>
          <Stack gap={0.5}>
            {group.declarations.map((declaration) => (
              <Declaration
                key={rowKeyOf(declaration.row)}
                declaration={declaration}
                linked={linked}
              />
            ))}
          </Stack>
        </Disclosure.Panel>
      </Stack>
    </Disclosure.Root>
  );
}

/**
 * One file of a unit as a badge: the opened file marked, a found file a press that opens it, and
 * a missing file greyed without a press.
 */
function UnitFile({ file, linked }: { file: SetFile; linked: boolean }) {
  const openFile = useOpenSetFile();
  const label = `${KIND_LABELS[unitFileKind(file.path)]()}: ${fileName(file.path)}`;

  if (file.opened) {
    return (
      <Badge size="sm" tone="accent">
        {m.audio_units_opened_file_label({ file: label })}
      </Badge>
    );
  }
  if (file.state.kind === "missing" || file.asset === null) {
    return (
      <Badge size="sm" className="opacity-50">
        {m.audio_units_missing_file_label({ file: label })}
      </Badge>
    );
  }
  if (!linked) return <Badge size="sm">{label}</Badge>;
  return (
    <Badge size="sm" onClick={() => openFile(file)}>
      {label}
    </Badge>
  );
}

/** One bin that declares a unit, and the link to the contextual actions its holder links. */
function Declaration({ declaration, linked }: { declaration: BankDeclaration; linked: boolean }) {
  const openRow = useOpenSiteRow();
  const contextual = declaration.contextual;

  return (
    <Inline gap={1.5} align="center">
      <RowLink row={declaration.row} linked={linked} />
      {contextual !== null && linked && contextual.asset !== null && (
        <Button variant="ghost" size="xs" onClick={() => openRow(contextual)}>
          {m.audio_units_open_contextual_action()}
        </Button>
      )}
    </Inline>
  );
}

/** A bin and the row of it, as a press that opens the object at the row. */
function RowLink({ row, linked }: { row: SiteRow; linked: boolean }) {
  const openRow = useOpenSiteRow();
  const label = row.property?.label ?? row.object;

  if (!linked || row.asset === null) {
    return (
      <span className="truncate text-meta text-surface-300 select-text">
        {row.bin} <span className="text-surface-400">{label}</span>
      </span>
    );
  }
  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={() => openRow(row)}
      aria-label={m.audio_units_open_row_label({ bin: row.bin, row: label })}
    >
      <span className="truncate text-surface-200">{row.bin}</span>
      <span className="truncate text-surface-400">{label}</span>
    </Button>
  );
}

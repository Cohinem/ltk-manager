import {
  CaretRightIcon,
  ArrowsOutCardinalIcon,
  EyeSlashIcon,
  CrosshairIcon,
  TrashIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { use, useRef, useState } from "react";

import { Button, IconButton, Menu, Table, Tooltip } from "@/components";
import { errorSummary, m } from "@/i18n";
import { twMerge } from "@/utils";

import { useClassSchema } from "../../classes/hooks/useClassSchema";
import { nameHash } from "../../shared/utils/binHash";
import { LeafEditContext } from "../../tree/hooks/useLeafEdit";
import { componentHasDefaults } from "../inspector/utils/propertyDefaults";
import { ForceControl } from "./ForceControl";
import { addForceEdits } from "./forceEdits";
import { type AuthoredForce, FORCE_COLLECTION, FORCE_DEFINITIONS } from "./forceModel";
import { useForcePreview } from "./forcePreview";
import { useForces } from "./useForces";

/** Search includes the force type and every creator and raw field name. */
export function forceMatches(force: AuthoredForce, query: string): boolean {
  const definition = force.definition;
  const text =
    `${m.workshop_bin_forces_title()} ${definition.title()} ${definition.className} ${definition.list} ${definition.properties.map((property) => `${property.label()} ${property.name} ${nameHash(property.name)}`).join(" ")}`.toLocaleLowerCase();
  return query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .every((term) => text.includes(term));
}

/** Dedicated force editors, in game evaluation order. */
export function ForcesSection({ search }: { search: string }) {
  const { card, forces, visible, hosted, pending, error } = useForces();
  const edit = use(LeafEditContext);
  const preview = useForcePreview();
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [failed, setFailed] = useState(false);
  const matches = forces.filter((force) => forceMatches(force, search));
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const open = search.trim() !== "" || (expanded ?? forces.length > 0);

  async function add(definition: (typeof FORCE_DEFINITIONS)[number]) {
    if (saving.current || card === undefined || edit?.editProperty === undefined) {
      return;
    }

    saving.current = true;
    setBusy(true);
    setFailed(false);

    try {
      const saved = await edit.editProperty(card.row, FORCE_COLLECTION, addForceEdits(definition));
      setFailed(!saved);

      if (saved) {
        preview.clear();
        setExpanded(true);
      }
    } catch {
      setFailed(true);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  if (!visible || (search.trim() !== "" && matches.length === 0)) {
    return null;
  }

  return (
    <section
      data-ui="ForcesSection"
      className="flex flex-col border-t border-surface-700/40 py-1 font-sans text-row"
    >
      <header className="flex items-center justify-between gap-2 px-1.5">
        <button
          type="button"
          aria-expanded={open}
          disabled={search.trim() !== ""}
          onClick={() => setExpanded(!open)}
          className="flex min-h-6 flex-1 cursor-pointer items-center gap-1 text-left text-xs font-medium tracking-wide text-surface-400 uppercase hover:text-surface-200"
        >
          <CaretRightIcon weight="bold" className={twMerge("h-3 w-3", open && "rotate-90")} />
          {m.workshop_bin_forces_title()}
        </button>
        {edit?.editProperty !== undefined && (
          <Menu.Root>
            <Menu.Trigger
              render={
                <Button variant="ghost" size="sm" disabled={busy || pending || error !== null} />
              }
            >
              <PlusIcon weight="bold" className="h-3.5 w-3.5" />
              {m.workshop_bin_force_add_action()}
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner>
                <Menu.Popup>
                  {FORCE_DEFINITIONS.map((definition) => (
                    <Menu.Item key={definition.kind} onClick={() => void add(definition)}>
                      {definition.title()}
                    </Menu.Item>
                  ))}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        )}
      </header>
      {pending && (
        <p className="px-1.5 text-meta text-surface-400">{m.workshop_bin_force_loading_label()}</p>
      )}
      {error !== null && (
        <p role="alert" className="px-1.5 text-meta text-danger-text">
          {errorSummary(error)}
        </p>
      )}
      {failed && (
        <p role="alert" className="px-1.5 text-meta text-danger-text">
          {m.workshop_bin_force_save_failed_hint()}
        </p>
      )}
      {open && !pending && error === null && forces.length === 0 && (
        <p className="px-1.5 text-meta text-surface-400">{m.workshop_bin_forces_empty()}</p>
      )}
      {open &&
        matches.map((force) => (
          <ForceGroup
            key={`${force.row.entry}:${force.row.path}`}
            force={force}
            hosted={hosted}
            searching={search.trim() !== ""}
          />
        ))}
    </section>
  );
}

function ForceGroup({
  force,
  hosted,
  searching,
}: {
  force: AuthoredForce;
  hosted: boolean;
  searching: boolean;
}) {
  const edit = use(LeafEditContext);
  const preview = useForcePreview();
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [failed, setFailed] = useState(false);
  const selected = preview.selected === force.key && hosted;
  const { data: schema } = useClassSchema(nameHash(force.definition.className));
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const open = searching || (expanded ?? !componentHasDefaults(force.node, schema?.fields));

  async function remove() {
    if (saving.current || edit?.removeItem === undefined) {
      return;
    }

    saving.current = true;
    setBusy(true);

    try {
      const saved = await edit.removeItem(force.row);
      setFailed(!saved);

      if (saved) {
        preview.clear();
      }
    } catch {
      setFailed(true);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <div
      data-ui="ForcesSection:force"
      className={twMerge(
        "flex flex-col border-t border-surface-700/40",
        selected && "bg-accent-500/5",
      )}
    >
      <header className="flex items-center gap-1 bg-surface-800/50 pr-1">
        <Button
          variant="ghost"
          size="sm"
          className="min-w-0 flex-1 justify-start"
          aria-expanded={open}
          disabled={searching}
          onClick={() => setExpanded(!open)}
        >
          <CaretRightIcon weight="bold" className={twMerge("h-3 w-3", open && "rotate-90")} />
          {force.definition.title()}{" "}
          <span className="text-meta text-surface-400">{force.index + 1}</span>
        </Button>
        {hosted && force.supported && (
          <>
            <Tooltip content={m.workshop_bin_force_handle_action()}>
              <IconButton
                variant="ghost"
                size="xs"
                icon={<ArrowsOutCardinalIcon className="h-3.5 w-3.5" />}
                aria-label={m.workshop_bin_force_handle_action()}
                aria-pressed={selected}
                onClick={() => preview.select(selected ? null : force.key)}
              />
            </Tooltip>
            <Tooltip content={m.workshop_bin_force_mute_action()}>
              <IconButton
                variant="ghost"
                size="xs"
                icon={<EyeSlashIcon className="h-3.5 w-3.5" />}
                aria-label={m.workshop_bin_force_mute_action()}
                aria-pressed={preview.muted.has(force.key)}
                className="aria-pressed:bg-accent-500/15 aria-pressed:text-accent-300"
                onClick={() => preview.mute(force.key)}
              />
            </Tooltip>
            <Tooltip content={m.workshop_bin_force_solo_action()}>
              <IconButton
                variant="ghost"
                size="xs"
                icon={<CrosshairIcon className="h-3.5 w-3.5" />}
                aria-label={m.workshop_bin_force_solo_action()}
                aria-pressed={preview.solo === force.key}
                className="aria-pressed:bg-accent-500/15 aria-pressed:text-accent-300"
                onClick={() => preview.isolate(force.key)}
              />
            </Tooltip>
          </>
        )}
        {edit?.removeItem !== undefined && (
          <Tooltip content={m.workshop_bin_force_remove_action()}>
            <IconButton
              variant="ghost"
              size="xs"
              disabled={busy}
              icon={<TrashIcon className="h-3.5 w-3.5" />}
              aria-label={m.workshop_bin_force_remove_action()}
              onClick={() => void remove()}
            />
          </Tooltip>
        )}
      </header>
      {failed && (
        <p role="alert" className="text-meta text-danger-text">
          {m.workshop_bin_force_save_failed_hint()}
        </p>
      )}
      {!force.supported && (
        <p className="text-meta text-surface-400">{m.workshop_bin_force_unsupported_hint()}</p>
      )}
      {force.supported && open && (
        <Table.Root aria-label={force.definition.title()} className="table-fixed text-row">
          <colgroup>
            <col className="w-(--name-width)" />
            <col />
          </colgroup>
          <Table.Body>
            {force.definition.properties.map((property) => (
              <ForceControl
                key={property.name}
                force={force}
                property={property}
                hosted={hosted}
                disabled={busy}
              />
            ))}
          </Table.Body>
        </Table.Root>
      )}
    </div>
  );
}

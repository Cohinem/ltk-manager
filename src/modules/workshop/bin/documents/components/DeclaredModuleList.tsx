import { CheckIcon, PencilSimpleIcon, PlusIcon } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";

import { IconButton } from "@/components";
import { m } from "@/i18n";
import type { BinDocumentId, DeclaredModuleSummary, DeclaredState } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { useSelectModule } from "../../../state";
import { useModuleAction } from "../hooks/useDeclared";
import { moduleLabel } from "../utils/declaredModule";

interface DeclaredModuleListProps {
  document: BinDocumentId;
  declared: DeclaredState;
  /** The document is read-only, so every choice is disabled. */
  locked: boolean;
}

/**
 * The modules of the chosen layer's `game_data.yaml` a declared document's new keys can
 * join, as options of the Sandbox menu. The choice is the project's selected module.
 * ADR-0048.
 *
 * - Automatic, then every module of the layer. A `target` module is listed and disabled.
 * - Each module renames in place: Enter commits, Escape backs out, an empty name clears it.
 * - New module takes a name in place and is chosen at once. The next edit creates it,
 *   because a module holds at least one entry.
 */
export function DeclaredModuleList({ document, declared, locked }: DeclaredModuleListProps) {
  const [naming, setNaming] = useState(false);
  const selectModule = useSelectModule();
  const layer = declared.layer;

  function choose(selected: Parameters<typeof selectModule>[0]) {
    selectModule(selected);
    setNaming(false);
  }

  return (
    <div data-ui="DeclaredModuleList" className="flex flex-col gap-0.5">
      <ModuleOption
        chosen={declared.module.kind === "auto"}
        disabled={locked}
        hint={m.workshop_bin_module_auto_hint()}
        onChoose={() => choose(null)}
      >
        {m.workshop_bin_module_auto_label()}
      </ModuleOption>
      {declared.modules.map((module) => (
        <ModuleRow
          key={module.index}
          document={document}
          layer={layer}
          module={module}
          locked={locked}
          chosen={declared.module.kind === "index" && declared.module.index === module.index}
          onChoose={() => choose({ layer, kind: "index", index: module.index })}
        />
      ))}
      {declared.module.kind === "new" && (
        <ModuleOption chosen hint={m.workshop_bin_module_new_hint()} onChoose={() => {}}>
          {declared.module.name ?? m.workshop_bin_module_new_label()}
        </ModuleOption>
      )}
      {naming && (
        <NameInput
          initial=""
          onCommit={(name) => choose({ layer, kind: "new", name })}
          onCancel={() => setNaming(false)}
        />
      )}
      {!naming && (
        <button
          type="button"
          disabled={locked}
          onClick={() => setNaming(true)}
          className={OPTION_CLASSES}
        >
          <PlusIcon weight="bold" className="h-3.5 w-3.5 shrink-0 text-surface-400" />
          <span className="flex-1">{m.workshop_bin_module_new_action()}</span>
        </button>
      )}
    </div>
  );
}

/** The classes of one option in the Sandbox options, shared by the module list and the rest. */
export const OPTION_CLASSES =
  "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-surface-200 outline-none hover:bg-surface-veil focus-visible:bg-surface-veil disabled:cursor-not-allowed disabled:text-surface-400 disabled:hover:bg-transparent";

export interface ModuleOptionProps {
  chosen: boolean;
  hint?: string;
  disabled?: boolean;
  onChoose: () => void;
  children: ReactNode;
}

/** One option in the Sandbox options, with a check mark when it is the current choice. */
export function ModuleOption({ chosen, hint, disabled, onChoose, children }: ModuleOptionProps) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={chosen}
      disabled={disabled}
      title={hint}
      onClick={onChoose}
      className={OPTION_CLASSES}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {chosen && <CheckIcon weight="bold" className="h-3.5 w-3.5 shrink-0 text-accent-400" />}
    </button>
  );
}

interface ModuleRowProps {
  document: BinDocumentId;
  layer: string;
  module: DeclaredModuleSummary;
  locked: boolean;
  chosen: boolean;
  onChoose: () => void;
}

/** A module of the layer, which renames in place. */
function ModuleRow({ document, layer, module, locked, chosen, onChoose }: ModuleRowProps) {
  const [renaming, setRenaming] = useState(false);
  const act = useModuleAction(document);
  const label = moduleLabel(module);

  if (renaming) {
    return (
      <NameInput
        initial={module.name ?? ""}
        onCommit={(name) => {
          setRenaming(false);
          if (name === module.name) return;
          void act(layer, { kind: "rename", module: module.index, name });
        }}
        onCancel={() => setRenaming(false)}
      />
    );
  }

  return (
    <div className="group/module flex items-center gap-0.5">
      <ModuleOption
        chosen={chosen}
        disabled={locked || !module.takesKeys}
        hint={module.takesKeys ? undefined : m.workshop_bin_module_target_hint()}
        onChoose={onChoose}
      >
        {label}
      </ModuleOption>
      <IconButton
        icon={<PencilSimpleIcon weight="bold" />}
        disabled={locked}
        variant="ghost"
        size="xs"
        aria-label={m.workshop_bin_module_rename_action({ module: label })}
        className="opacity-0 group-hover/module:opacity-100 focus-visible:opacity-100"
        onClick={() => setRenaming(true)}
      />
    </div>
  );
}

interface NameInputProps {
  initial: string;
  /** The typed name, null for an empty one. */
  onCommit: (name: string | null) => void;
  onCancel: () => void;
}

/** A module name typed in place of the row it names. */
function NameInput({ initial, onCommit, onCancel }: NameInputProps) {
  const [value, setValue] = useState(initial);
  const commit = () => onCommit(value.trim() === "" ? null : value.trim());

  return (
    <input
      autoFocus
      value={value}
      placeholder={m.workshop_bin_module_name_placeholder()}
      aria-label={m.workshop_bin_module_name_placeholder()}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
      onBlur={onCancel}
      className={twMerge(
        "mx-1 my-0.5 min-w-0 rounded-sm border border-surface-600 bg-surface-900 px-1.5 py-0.5",
        "text-sm text-surface-100 outline-none select-text focus:border-accent-500",
      )}
    />
  );
}

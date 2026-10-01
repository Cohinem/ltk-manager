import { PlusIcon } from "@phosphor-icons/react";
import { notifyManager } from "@tanstack/react-query";

import { Menu } from "@/components";
import { m } from "@/i18n";
import type { BinDocumentId, DeclaredModuleChoice, DeclaredState } from "@/lib/tauri";

import { useSelectModule } from "../../../state";
import { useModuleAction } from "../hooks/useDeclared";
import { moduleLabel } from "../utils/declaredModule";
import { SandboxRadioItem } from "./SandboxRadioItem";

interface DeclaredModuleListProps {
  document: BinDocumentId;
  declared: DeclaredState;
  /** The document takes no edit, so every choice is disabled. */
  locked: boolean;
}

const AUTO = "auto";
const NEW = "new";
const INDEX = "index:";

/**
 * The modules of the chosen layer's `game_data.yaml` a declared document's new keys can
 * join, as a radio group of the Sandbox options. The choice is the project's selected
 * module. ADR-0048, ADR-0054.
 *
 * - Automatic, then every module of the layer. A `target` module is listed and disabled.
 * - New module adds an empty module at the end and chooses it. The outline names it.
 */
export function DeclaredModuleList({ document, declared, locked }: DeclaredModuleListProps) {
  const selectModule = useSelectModule();
  const act = useModuleAction(document);
  const { layer, modules } = declared;

  function choose(value: string) {
    if (value === AUTO) {
      selectModule(null);
    } else if (value.startsWith(INDEX)) {
      selectModule({ layer, kind: "index", index: Number(value.slice(INDEX.length)) });
    }
  }

  async function create() {
    const made = await act(layer, { kind: "create", name: null });
    if (!made) return;

    /* Queued behind the query's own notifications, so the sync never meets the choice before
       the module it names, which it would take for a removed one and clear. */
    notifyManager.schedule(() => selectModule({ layer, kind: "index", index: modules.length }));
  }

  return (
    <>
      <Menu.RadioGroup
        value={choiceValue(declared.module)}
        onValueChange={(value: string) => choose(value)}
      >
        <SandboxRadioItem
          value={AUTO}
          closeOnClick
          disabled={locked}
          note={m.workshop_bin_module_auto_hint()}
        >
          {m.workshop_bin_module_auto_label()}
        </SandboxRadioItem>
        {modules.map((module) => (
          <SandboxRadioItem
            key={module.index}
            value={`${INDEX}${module.index}`}
            closeOnClick
            disabled={locked || !module.takesKeys}
            note={module.takesKeys ? undefined : m.workshop_bin_module_target_hint()}
          >
            {moduleLabel(module)}
          </SandboxRadioItem>
        ))}
        {declared.module.kind === "new" && (
          <SandboxRadioItem value={NEW} disabled={locked} note={m.workshop_bin_module_new_hint()}>
            {declared.module.name ?? m.workshop_bin_module_new_label()}
          </SandboxRadioItem>
        )}
      </Menu.RadioGroup>
      <Menu.Item icon={<PlusIcon weight="bold" />} disabled={locked} onClick={() => void create()}>
        {m.workshop_bin_module_new_action()}
      </Menu.Item>
    </>
  );
}

/** The radio value of the module a document's new keys join. */
function choiceValue(choice: DeclaredModuleChoice): string {
  switch (choice.kind) {
    case "auto":
      return AUTO;
    case "index":
      return `${INDEX}${choice.index}`;
    case "new":
      return NEW;
  }
}

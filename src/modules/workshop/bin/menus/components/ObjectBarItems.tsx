import {
  ArrowClockwiseIcon,
  ArrowsInLineVerticalIcon,
  CodeBlockIcon,
  CopyIcon,
  CopySimpleIcon,
  FileIcon,
  HashIcon,
  LayoutIcon,
  MagnifyingGlassIcon,
  PathIcon,
  SealCheckIcon,
} from "@phosphor-icons/react";
import { use } from "react";

import { Menu } from "@/components";
import { useCopyToClipboard } from "@/hooks";
import { m } from "@/i18n";

/* The leaf rather than the references barrel, which pulls the document that routes here. */
import {
  classReferences,
  objectReferences,
  useFindReferences,
} from "../../../references/api/useFindReferences";
import { COLLAPSE_ALL_SHORTCUT } from "../../../shared/utils/treeGestures";
import { useSetUseDeclarations } from "../../../state";
import { useBinReload } from "../../documents/components/BinEditState";
import { useCopyDeclaration, useRowDeclaration } from "../../documents/hooks/useDeclared";
import { PanesMenuItems } from "../../shell/components/ShellPaneTree";
import { type ObjectMenu, ObjectMenuContext } from "../state/objectMenu";

function useObjectMenu(): ObjectMenu | null {
  return use(ObjectMenuContext);
}

/** The object's File items: reload after a conflict, show in file, duplicate, declare edits. */
export function ObjectFileItems() {
  const menu = useObjectMenu();
  if (menu === null) return null;

  const { readOnly, onShowInFile, onDuplicate } = menu;

  return (
    <>
      {readOnly === null && <ReloadItem menu={menu} />}
      <Menu.Item icon={<FileIcon className="size-4" />} onClick={onShowInFile}>
        {m.workshop_bin_show_in_file_action()}
      </Menu.Item>
      {onDuplicate !== undefined && (
        <Menu.Item icon={<CopySimpleIcon className="size-4" />} onClick={onDuplicate}>
          {m.workshop_bin_duplicate_object_action()}
        </Menu.Item>
      )}
      {readOnly === "declarationsOff" && <DeclareEditsItem />}
    </>
  );
}

function ReloadItem({ menu }: { menu: ObjectMenu }) {
  const { changedOnDisk, reload } = useBinReload(menu.document, menu.asset, menu.onReload);
  if (!changedOnDisk) return null;

  return (
    <Menu.Item icon={<ArrowClockwiseIcon className="size-4" />} onClick={reload}>
      {m.workshop_bin_reload_action()}
    </Menu.Item>
  );
}

function DeclareEditsItem() {
  const setUseDeclarations = useSetUseDeclarations();

  return (
    <Menu.Item icon={<SealCheckIcon className="size-4" />} onClick={() => setUseDeclarations(true)}>
      {m.workshop_bin_declarations_declare_action()}
    </Menu.Item>
  );
}

/** The object's Edit items: find references and the Copy submenu. */
export function ObjectEditItems() {
  const menu = useObjectMenu();
  const findReferences = useFindReferences();
  if (menu === null) return null;

  const { object } = menu;

  return (
    <>
      <Menu.Item
        icon={<MagnifyingGlassIcon className="size-4" />}
        onClick={() => findReferences(objectReferences(object.entry, object.name))}
      >
        {m.workshop_references_find_object_action()}
      </Menu.Item>
      <Menu.Item
        icon={<MagnifyingGlassIcon className="size-4" />}
        onClick={() => findReferences(classReferences(object.classHash, object.class))}
      >
        {m.workshop_references_find_class_action()}
      </Menu.Item>
      <Menu.Separator />
      <Menu.SubmenuRoot>
        <Menu.SubmenuTrigger icon={<CopyIcon className="size-4" />}>
          {m.workshop_bin_menu_copy_label()}
        </Menu.SubmenuTrigger>
        <Menu.SubmenuContent className="w-56">
          <CopyItems menu={menu} />
        </Menu.SubmenuContent>
      </Menu.SubmenuRoot>
    </>
  );
}

function CopyItems({ menu }: { menu: ObjectMenu }) {
  const copy = useCopyToClipboard();
  const { document, object } = menu;
  const spelled = useRowDeclaration(document, object.entry, "");
  const copyDeclaration = useCopyDeclaration();
  const objectClass = object.class;

  return (
    <>
      <Menu.Item
        icon={<PathIcon className="size-4" />}
        onClick={() => void copy(object.name, m.workshop_bin_path_label())}
      >
        {m.workshop_bin_copy_path_action()}
      </Menu.Item>
      <Menu.Item
        icon={<CodeBlockIcon className="size-4" />}
        disabled={spelled?.declaration == null}
        reason={
          spelled !== null && spelled.declaration === null
            ? m.workshop_bin_copy_declaration_refused_hint()
            : undefined
        }
        onClick={() => spelled !== null && copyDeclaration(spelled)}
      >
        {m.workshop_bin_copy_declaration_action()}
      </Menu.Item>
      <Menu.Item
        icon={<HashIcon className="size-4" />}
        onClick={() => void copy(object.entry, m.workshop_bin_hash_label())}
      >
        {m.workshop_bin_copy_hash_action()}
      </Menu.Item>
      {objectClass !== null && (
        <Menu.Item
          icon={<CopyIcon className="size-4" />}
          onClick={() => void copy(objectClass, m.workshop_bin_name_label())}
        >
          {m.workshop_bin_copy_class_name_action()}
        </Menu.Item>
      )}
      <Menu.Item
        icon={<HashIcon className="size-4" />}
        onClick={() => void copy(object.classHash, m.workshop_bin_hash_label())}
      >
        {m.workshop_bin_copy_class_hash_action()}
      </Menu.Item>
    </>
  );
}

/**
 * The object's View items. `mode` is the layout and Properties choice of a class with a layout.
 * `panes` is the Panes submenu of a shell and Collapse all.
 */
export function ObjectViewItems({ part }: { part: "mode" | "panes" }) {
  const menu = useObjectMenu();
  if (menu === null) return null;

  if (part === "mode") {
    if (menu.layoutTitle === null) return null;

    return (
      <Menu.RadioGroup
        value={menu.mode}
        onValueChange={(mode) => menu.onMode(mode as ObjectMenu["mode"])}
      >
        <Menu.RadioItem value="layout">{menu.layoutTitle}</Menu.RadioItem>
        <Menu.RadioItem value="properties">{m.workshop_bin_mode_properties_label()}</Menu.RadioItem>
      </Menu.RadioGroup>
    );
  }

  return (
    <>
      {menu.shell !== undefined && (
        <Menu.SubmenuRoot>
          <Menu.SubmenuTrigger icon={<LayoutIcon className="size-4" />}>
            {m.workshop_bin_panes_menu_label()}
          </Menu.SubmenuTrigger>
          <Menu.SubmenuContent className="w-52">
            <PanesMenuItems kind={menu.shell} />
          </Menu.SubmenuContent>
        </Menu.SubmenuRoot>
      )}
      <Menu.Item
        icon={<ArrowsInLineVerticalIcon className="size-4" />}
        shortcut={COLLAPSE_ALL_SHORTCUT}
        disabled={menu.onCollapseAll === undefined}
        reason={m.workshop_bin_menu_properties_reason()}
        onClick={menu.onCollapseAll}
      >
        {m.workshop_explorer_collapse_all_label()}
      </Menu.Item>
    </>
  );
}

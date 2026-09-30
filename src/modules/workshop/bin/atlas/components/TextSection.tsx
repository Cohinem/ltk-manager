import { CopyIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  Button,
  Combobox,
  Field,
  IconButton,
  Popover,
  Tooltip,
  useComboboxFilter,
} from "@/components";
import { m } from "@/i18n";
import type { NewObject, PropertyEdit, UiFontChoice } from "@/lib/tauri";

import { uiQueries } from "../api/uiQueries";
import { fontLinkEdit } from "../engine/edit/fontEdits";
import type { ViewTree } from "../engine/model/tree";
import type { ViewElement } from "../engine/model/view";
import { useFontFaceImport } from "../hooks/useFontFaceImport";
import { useModFolder } from "../hooks/useModFolder";
import { useAtlasEdit } from "../state/atlasEdit";
import { FontStyleFields } from "./FontStyleFields";
import { FieldLine, SectionBlock } from "./sectionParts";

export interface TextSectionProps {
  readonly element: ViewElement;
  readonly tree: ViewTree;
  readonly editable: boolean;
}

/**
 * A text's string and font, per "Fonts" in docs/plans/atlas-ui-editor.md: the `TRAKey`, a
 * searchable list of every font the scene bin and the game's `ux/fonts` hold, a new font copied
 * from the drawn one into the scene bin, and the face and colours of a font the scene bin holds.
 */
export function TextSection({ element, tree, editable }: TextSectionProps) {
  const edit = useAtlasEdit();
  const document = edit?.variant ?? edit?.scene ?? null;
  const catalog = useQuery(uiQueries.fontCatalog(document)).data ?? null;
  const folder = useModFolder();
  const faceImport = useFontFaceImport(document);
  const look = element.look;
  if (look.kind !== "text") return null;

  const drawn = look.font === null ? null : (tree.view.fonts[look.font] ?? null);
  const current = catalog?.fonts.find((font) => font.path === drawn?.path) ?? null;
  const apply = (edits: readonly PropertyEdit[]) => {
    if (edit !== null) void edit.apply(edits);
  };

  const create = async (name: string) => {
    if (edit === null || current === null) return;

    const origin: NewObject = current.project
      ? { type: "clone", source: current.entry }
      : { type: "copy", source: current.entry };
    const entry = await edit.create(name, origin);
    if (entry !== null) await edit.apply([fontLinkEdit(element.key, entry)]);
  };

  return (
    <SectionBlock id="text" title={m.workshop_bin_section_text_label()}>
      <FieldLine label={m.workshop_bin_atlas_text_key_label()}>
        <span className="min-w-0 truncate font-mono select-text">
          {look.traKey === "" ? m.workshop_bin_atlas_runtime_value() : look.traKey}
        </span>
      </FieldLine>
      <FieldLine label={m.workshop_bin_atlas_font_label()}>
        <FontPicker
          fonts={catalog?.fonts ?? []}
          value={current}
          drawn={drawn?.path ?? null}
          disabled={!editable || catalog === null}
          onPick={(font) => apply([fontLinkEdit(element.key, font.entry)])}
        />
        {editable && current !== null && (
          <NewFontButton suggested={`${folder}Fonts/${leafOf(current)}`} onCreate={create} />
        )}
      </FieldLine>
      {current?.project === true && drawn !== null && (
        <FontStyleFields
          font={current}
          drawn={drawn}
          faces={catalog?.types ?? []}
          editable={editable}
          apply={apply}
          importing={faceImport.busy}
          onImportFace={(from) => void faceImport.run(current, from)}
        />
      )}
    </SectionBlock>
  );
}

interface FontPickerProps {
  readonly fonts: readonly UiFontChoice[];
  readonly value: UiFontChoice | null;
  /** The drawn font's path, which shows while the catalog does not list it. */
  readonly drawn: string | null;
  readonly disabled: boolean;
  readonly onPick: (font: UiFontChoice) => void;
}

/** Every font by its name, the project's marked, searchable by name, path and face. */
function FontPicker({ fonts, value, drawn, disabled, onPick }: FontPickerProps) {
  const filter = useComboboxFilter();

  return (
    <Combobox.Root<UiFontChoice>
      items={[...fonts]}
      value={value}
      onValueChange={(font) => {
        if (font !== null && font.entry !== value?.entry) onPick(font);
      }}
      disabled={disabled}
      itemToStringLabel={labelOf}
      itemToStringValue={(font) => font.entry}
      isItemEqualToValue={(font, chosen) => font.entry === chosen.entry}
      filter={(font, query) =>
        filter.contains(font, query, (item) =>
          [labelOf(item), item.path, item.face ?? ""].join(" "),
        )
      }
    >
      <div className="relative min-w-0 flex-1" data-ui="FontPicker">
        <Combobox.Input
          aria-label={m.workshop_bin_atlas_font_label()}
          placeholder={value === null && drawn !== null ? leafOfPath(drawn) : undefined}
          className="h-7 pr-7 text-meta"
        />
        <Combobox.Trigger className="absolute top-0 right-0 flex h-full items-center pr-2">
          <Combobox.Icon />
        </Combobox.Trigger>
      </div>
      <Combobox.Portal>
        <Combobox.Positioner className="min-w-(--anchor-width)">
          <Combobox.Popup className="max-h-80">
            <Combobox.List>
              {(font: UiFontChoice) => (
                <Combobox.Item key={font.entry} value={font} className="gap-2 pr-2">
                  <span className="min-w-0 flex-1 truncate">{labelOf(font)}</span>
                  {font.project && (
                    <span className="shrink-0 text-meta text-accent-300">
                      {m.workshop_bin_atlas_font_project_tag()}
                    </span>
                  )}
                  {font.face !== null && (
                    <span className="max-w-32 shrink-0 truncate text-meta text-surface-400">
                      {leafOfPath(font.face)}
                    </span>
                  )}
                </Combobox.Item>
              )}
            </Combobox.List>
            <Combobox.Empty>{m.workshop_bin_atlas_font_empty()}</Combobox.Empty>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

interface NewFontButtonProps {
  readonly suggested: string;
  readonly onCreate: (name: string) => Promise<void>;
}

/** A copy of the drawn font under a name the author gives it, which the text then draws with. */
function NewFontButton({ suggested, onCreate }: NewFontButtonProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(suggested);
  const [busy, setBusy] = useState(false);
  const label = m.workshop_bin_atlas_font_new_action();

  const submit = async () => {
    const trimmed = name.trim();
    if (trimmed === "" || busy) return;

    setBusy(true);
    await onCreate(trimmed);
    setBusy(false);
    setOpen(false);
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setName(suggested);
      }}
    >
      <Tooltip content={label}>
        <Popover.Trigger
          render={
            <IconButton
              variant="ghost"
              size="xs"
              compact
              aria-label={label}
              icon={<CopyIcon weight="bold" className="h-4 w-4" />}
            />
          }
        />
      </Tooltip>
      <Popover.Portal>
        <Popover.Positioner side="left" align="start" sideOffset={8}>
          <Popover.Popup aria-label={label} className="flex w-80 flex-col gap-2 p-3">
            <Field.Root>
              <Field.Label className="text-meta text-surface-300">
                {m.workshop_bin_atlas_font_new_name_label()}
              </Field.Label>
              <Field.Control
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submit();
                }}
                autoComplete="off"
                spellCheck={false}
                className="h-7 px-2 font-mono text-meta select-text"
              />
            </Field.Root>
            <p className="text-meta text-surface-400">{m.workshop_bin_atlas_font_new_hint()}</p>
            <Button
              variant="filled"
              size="xs"
              disabled={busy || name.trim() === ""}
              onClick={() => void submit()}
              className="self-end"
            >
              {m.workshop_bin_atlas_font_new_create_action()}
            </Button>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function labelOf(font: UiFontChoice): string {
  return font.name === "" ? leafOfPath(font.path) : font.name;
}

/** A font's name as the last step of a new object path, with no spaces. */
function leafOf(font: UiFontChoice): string {
  return labelOf(font).replace(/\s+/g, "");
}

function leafOfPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

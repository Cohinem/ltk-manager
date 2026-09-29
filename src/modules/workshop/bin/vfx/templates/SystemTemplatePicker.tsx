import { useEffect, useMemo, useRef, useState } from "react";

import { Combobox } from "@/components";
import { m } from "@/i18n";
import type { VfxTemplate } from "@/lib/tauri";

import { nameHash } from "../../shared/utils/binHash";
import { useVfxTemplates } from "./templateQueries";
import { templateDescription, templateLabel } from "./templateText";

const SYSTEM_CLASS = "VfxSystemDefinitionData";

/** What a new particle system starts from: nothing, or a system template. */
export type SystemStart =
  | { readonly kind: "blank" }
  | { readonly kind: "template"; readonly template: VfxTemplate };

/** Whether a picked class, by its name or its `0x` hash, is the particle system's. */
export function isSystemClass(wire: string, label: string): boolean {
  return label === SYSTEM_CLASS || wire.toLowerCase() === nameHash(SYSTEM_CLASS);
}

interface SystemTemplatePickerProps {
  className: string;
  onPick: (start: SystemStart) => void;
  onEscape: () => void;
}

/**
 * The step of the new object line that picks what a new particle system starts from, Blank
 * first and then each system template. ADR-0058.
 */
export function SystemTemplatePicker({ className, onPick, onEscape }: SystemTemplatePickerProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(true);
  const templates = useVfxTemplates("system");
  const label = m.workshop_bin_new_object_template_label();

  const starts = useMemo<SystemStart[]>(() => {
    const all: SystemStart[] = [
      { kind: "blank" },
      ...templates.map((template) => ({ kind: "template" as const, template })),
    ];
    const typed = text.trim().toLowerCase();
    return typed === ""
      ? all
      : all.filter((start) => startLabel(start).toLowerCase().includes(typed));
  }, [templates, text]);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <Combobox.Root<SystemStart>
      items={starts}
      inputValue={text}
      onInputValueChange={(next, details) => {
        if (details.reason === "input-clear" || details.reason === "none") return;
        setText(next);
      }}
      onValueChange={(start) => start !== null && onPick(start)}
      open={open && starts.length > 0}
      onOpenChange={setOpen}
      filter={() => true}
      autoHighlight
      itemToStringLabel={startLabel}
      itemToStringValue={startKey}
    >
      <Combobox.Input
        ref={ref}
        data-draft={text !== "" || undefined}
        placeholder={label}
        aria-label={label}
        spellCheck={false}
        autoComplete="off"
        className={className}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          if (text === "") onEscape();
          else setText("");
        }}
      />
      <Combobox.Portal>
        <Combobox.Positioner side="bottom" align="start" sideOffset={2}>
          <Combobox.Popup className="max-h-72 min-w-80 py-0.5">
            <Combobox.List>
              {(start: SystemStart) => (
                <Combobox.Item key={startKey(start)} value={start} className="px-2 py-1">
                  <span className="flex min-w-0 flex-col">
                    <span>{startLabel(start)}</span>
                    <span className="text-meta text-surface-400">{startDescription(start)}</span>
                  </span>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

function startKey(start: SystemStart): string {
  return start.kind === "blank" ? "blank" : start.template.id;
}

function startLabel(start: SystemStart): string {
  return start.kind === "blank"
    ? m.workshop_bin_new_object_blank_label()
    : templateLabel(start.template);
}

function startDescription(start: SystemStart): string | null {
  return start.kind === "blank"
    ? m.workshop_bin_new_object_blank_description()
    : templateDescription(start.template);
}

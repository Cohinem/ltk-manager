import { FileArrowUpIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { Button, ColorPicker, IconButton, Popover, Select, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { PropertyEdit, UiFontChoice } from "@/lib/tauri";
import { colorHex, type RgbColor } from "@/utils";

import { Swatch } from "../../values/components/ColorMark";
import { type FontColor, fontColorEdit, fontFaceEdit } from "../engine/edit/fontEdits";
import type { ViewFont } from "../engine/model/view";
import { FieldLine } from "./sectionParts";

type Rgba = readonly [number, number, number, number];

/** The colours a font draws with, by field, which `ViewFont` holds under the same names. */
const COLORS: readonly (readonly [FontColor, () => string])[] = [
  ["color", m.workshop_bin_atlas_color_label],
  ["outlineColor", m.workshop_bin_atlas_font_outline_label],
  ["shadowColor", m.workshop_bin_atlas_font_shadow_label],
  ["glowColor", m.workshop_bin_atlas_font_glow_label],
];

export interface FontStyleFieldsProps {
  /** The font, one the scene bin holds. */
  readonly font: UiFontChoice;
  /** The font as the view resolved it, whose colours the lines start from. */
  readonly drawn: ViewFont;
  /** Every `FontType` the font can draw with. */
  readonly faces: readonly UiFontChoice[];
  readonly editable: boolean;
  readonly apply: (edits: readonly PropertyEdit[]) => void;
  /** Whether a font file is being made into a face. */
  readonly importing: boolean;
  /** Make a face of a font file the author picks, modelled on `from`, the font's own face. */
  readonly onImportFace: (from: UiFontChoice) => void;
}

/**
 * The face and colours of a font the scene bin holds, each change one undo step, and a face made
 * from a font file.
 */
export function FontStyleFields({
  font,
  drawn,
  faces,
  editable,
  apply,
  importing,
  onImportFace,
}: FontStyleFieldsProps) {
  const label = m.workshop_bin_atlas_font_face_label();
  const importLabel = m.workshop_bin_atlas_font_import_action();
  const face = faces.find((each) => each.entry === font.typeData);

  return (
    <>
      <FieldLine label={label}>
        <Select.Root
          value={font.typeData ?? ""}
          disabled={!editable}
          onValueChange={(face: string | null) => {
            if (face !== null && face !== font.typeData) apply([fontFaceEdit(font.entry, face)]);
          }}
        >
          <Select.Trigger aria-label={label} className="h-7 min-w-0 flex-1 gap-1 px-2 text-meta">
            <Select.Value className="truncate">
              {(entry: string) => faceLabel(faces.find((face) => face.entry === entry))}
            </Select.Value>
            <Select.Icon />
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner>
              <Select.Popup className="max-h-80">
                {faces.map((face) => (
                  <Select.Item key={face.entry} value={face.entry}>
                    {faceLabel(face)}
                  </Select.Item>
                ))}
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
        {editable && face !== undefined && (
          <Tooltip content={importLabel}>
            <IconButton
              variant="ghost"
              size="xs"
              compact
              aria-label={importLabel}
              disabled={importing}
              icon={<FileArrowUpIcon weight="bold" className="h-4 w-4" />}
              onClick={() => onImportFace(face)}
            />
          </Tooltip>
        )}
      </FieldLine>
      {COLORS.map(([field, name]) => (
        <ColorLine
          key={field}
          label={name()}
          value={drawn[field]}
          disabled={!editable}
          onCommit={(rgba) => apply([fontColorEdit(font.entry, field, rgba)])}
        />
      ))}
    </>
  );
}

interface ColorLineProps {
  readonly label: string;
  /** The colour as bytes, `r, g, b, a`. */
  readonly value: Rgba;
  readonly disabled: boolean;
  readonly onCommit: (rgba: Rgba) => void;
}

/** A colour as a swatch and its hex digits, whose picker writes the colour once it closes. */
function ColorLine({ label, value, disabled, onCommit }: ColorLineProps) {
  const [draft, setDraft] = useState<RgbColor | null>(null);
  const shown: RgbColor = draft ?? [value[0] / 255, value[1] / 255, value[2] / 255];

  const close = () => {
    if (draft === null) return;

    const bytes = draft.map((channel) => Math.round(channel * 255));
    setDraft(null);
    if (bytes.some((channel, at) => channel !== value[at])) {
      onCommit([bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, value[3]]);
    }
  };

  return (
    <FieldLine label={label}>
      <Popover.Root
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <Popover.Trigger
          disabled={disabled}
          render={
            <Button
              variant="ghost"
              size="xs"
              compact
              aria-label={label}
              left={<Swatch rgba={[...shown, value[3] / 255]} className="h-4 w-4" />}
              className="font-mono text-code"
            >
              {colorHex(shown)}
            </Button>
          }
        />
        <Popover.Portal>
          <Popover.Positioner side="left" align="center" sideOffset={12}>
            <Popover.Popup aria-label={label} className="w-60 p-3">
              <ColorPicker value={shown} label={label} onValueChange={setDraft} />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </FieldLine>
  );
}

function faceLabel(face: UiFontChoice | undefined): string {
  if (face === undefined) return m.workshop_bin_atlas_runtime_value();

  const file = face.face ?? face.path;
  return file.slice(file.replace(/\\/g, "/").lastIndexOf("/") + 1);
}

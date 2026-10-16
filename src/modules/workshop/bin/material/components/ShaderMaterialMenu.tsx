import { CaretDownIcon, SwatchesIcon } from "@phosphor-icons/react";

import { Button, Menu } from "@/components";
import { m } from "@/i18n";
import type { BinDocumentId, PreviewMaterial } from "@/lib/tauri";

import { useShaderMaterial } from "../hooks/useShaderMaterial";
import { previewKey, usePreviewDefinesStore } from "../state/previewDefines";

/** The radio value of the def's own defaults, which no material entry takes. */
const DEFAULTS = "defaults";

/** Returns the radio value a material is listed under. */
function valueOf(material: PreviewMaterial): string {
  return `${material.entry}@${JSON.stringify(material.asset)}`;
}

/** Returns the last segment of `path`, which the menu shows as the material's name. */
function lastSegment(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/**
 * The menu of the material that a shader def's preview draws through, or the def's own
 * defaults. "The material shell" in docs/ux/BIN_EDITOR.md.
 *
 * Lists every `StaticMaterialDef` that links the def, each by its path and the bin that
 * declares it. Renders nothing if no material links the def.
 */
export function ShaderMaterialMenu({
  document,
  entry,
}: {
  document: BinDocumentId;
  entry: string;
}) {
  const { linking, chosen } = useShaderMaterial(document, entry, true);
  const drawThrough = usePreviewDefinesStore((state) => state.drawThrough);
  if (linking.length === 0) return null;

  const key = previewKey(document, entry);
  const shown = chosen === null ? null : linking.find((each) => valueOf(each) === valueOf(chosen));
  const label =
    shown === undefined || shown === null
      ? m.workshop_bin_shader_material_defaults_label()
      : lastSegment(shown.path);
  const value = chosen === null ? DEFAULTS : valueOf(chosen);

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            variant="ghost"
            size="xs"
            aria-label={m.workshop_bin_shader_material_label()}
            left={<SwatchesIcon weight="bold" className="size-4" />}
            right={<CaretDownIcon weight="bold" className="size-3" />}
          >
            <span className="max-w-40 truncate">{label}</span>
          </Button>
        }
      />
      <Menu.Content
        align="end"
        data-ui="ShaderMaterialMenu"
        className="max-h-96 w-80 overflow-y-auto"
      >
        <Menu.RadioGroup
          value={value}
          onValueChange={(value) =>
            drawThrough(key, linking.find((each) => valueOf(each) === value) ?? null)
          }
        >
          <Menu.RadioItem value={DEFAULTS}>
            {m.workshop_bin_shader_material_defaults_label()}
          </Menu.RadioItem>
          <Menu.Separator />
          {linking.map((material) => (
            <Menu.RadioItem key={valueOf(material)} value={valueOf(material)}>
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{lastSegment(material.path)}</span>
                {/* DS-TEXT */}
                <span className="truncate text-fine text-surface-400">{material.file}</span>
              </span>
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
      </Menu.Content>
    </Menu.Root>
  );
}

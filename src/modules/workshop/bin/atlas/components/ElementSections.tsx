import { Checkbox, Select } from "@/components";
import { m } from "@/i18n";
import type { PropertyEdit } from "@/lib/tauri";

import { enabledEdit, layerEdit } from "../engine/edit/elementEdits";
import { sceneMoveEdits } from "../engine/edit/targets";
import type { LayoutSettings, PixelRect } from "../engine/layout/solve";
import { buttonOf } from "../engine/model/buttons";
import { comboOf } from "../engine/model/combo";
import { labelOf } from "../engine/model/layers";
import { meterOf } from "../engine/model/meters";
import { sceneOf, type ViewTree } from "../engine/model/tree";
import type { ViewElement, ViewLayout } from "../engine/model/view";
import { useAtlasEdit } from "../state/atlasEdit";
import { ButtonSection } from "./ButtonSection";
import { ComboSection } from "./ComboSection";
import { MeterSection } from "./MeterSection";
import { PositionSection } from "./PositionSection";
import { DraftNumber, FieldLine, SectionBlock } from "./sectionParts";
import { SpriteSection } from "./SpriteSection";

export interface ElementSectionsProps {
  readonly element: ViewElement;
  readonly tree: ViewTree;
  readonly settings: LayoutSettings;
  readonly solved: ReadonlyMap<string, PixelRect> | null;
  /** The view's preview key, which holds its combo boxes' preview state. */
  readonly view: string;
}

/**
 * An element's fields as an author thinks of them, over the raw fields the file writes: the scene
 * and layer it draws on, where it sits, what it draws, the button or meter it is, and the combo box
 * it belongs to. Each edit is one undo step through the shell's scene bin, and every field reads
 * only where the scene bin takes no edits.
 */
export function ElementSections({ element, tree, settings, solved, view }: ElementSectionsProps) {
  const edit = useAtlasEdit();
  const editable = edit?.editable === true;
  const apply = (edits: readonly PropertyEdit[]) => {
    if (edit !== null) void edit.apply(edits);
  };
  const combo = comboOf(tree.view.comboBoxes, element.key);
  const button = buttonOf(element);
  const meter = meterOf(element);

  return (
    <div data-ui="ElementSections" className="flex flex-col gap-2">
      <IdentitySection element={element} tree={tree} editable={editable} apply={apply} />
      <PositionSection
        element={element}
        tree={tree}
        settings={settings}
        solved={solved}
        editable={editable}
        apply={apply}
      />
      <LookSection element={element} tree={tree} />
      <SpriteSection element={element} tree={tree} />
      {button !== null && (
        <ButtonSection
          element={element}
          button={button}
          tree={tree}
          editable={editable}
          apply={apply}
        />
      )}
      {meter !== null && (
        <MeterSection
          element={element}
          meter={meter}
          tree={tree}
          view={view}
          editable={editable}
          apply={apply}
        />
      )}
      {combo !== undefined && (
        <ComboSection combo={combo} view={view} editable={editable} apply={apply} />
      )}
    </div>
  );
}

function IdentitySection({
  element,
  tree,
  editable,
  apply,
}: {
  element: ViewElement;
  tree: ViewTree;
  editable: boolean;
  apply: (edits: readonly PropertyEdit[]) => void;
}) {
  const scene = sceneOf(tree, element.key);
  const scenes = [...tree.scenes.values()];
  const label = (key: string) => {
    const held = tree.scenes.get(key);
    return held === undefined ? key : labelOf(held.label, held.path, key);
  };

  return (
    <SectionBlock id="identity" title={m.workshop_bin_section_identity_label()}>
      <FieldLine label={m.workshop_bin_atlas_scene_label()}>
        <Select.Root
          value={scene ?? ""}
          disabled={!editable}
          onValueChange={(next) => {
            if (next !== null && next !== scene) apply(sceneMoveEdits(tree, element.key, next));
          }}
        >
          <Select.Trigger
            aria-label={m.workshop_bin_atlas_scene_label()}
            className="h-7 min-w-0 flex-1 gap-1 px-2 text-meta"
          >
            <Select.Value className="truncate">{(key: string) => label(key)}</Select.Value>
            <Select.Icon />
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner>
              <Select.Popup className="max-h-80">
                {scenes.map((each) => (
                  <Select.Item key={each.key} value={each.key}>
                    {label(each.key)}
                  </Select.Item>
                ))}
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
      </FieldLine>
      <FieldLine label={m.workshop_bin_atlas_layer_label()}>
        <DraftNumber
          value={element.layer}
          label={m.workshop_bin_atlas_layer_label()}
          min={0}
          disabled={!editable}
          onCommit={(value) => apply([layerEdit(element.key, value)])}
        />
      </FieldLine>
      <FieldLine label={m.workshop_bin_atlas_enabled_label()}>
        <Checkbox
          size="sm"
          aria-label={m.workshop_bin_atlas_enabled_label()}
          checked={element.enabled}
          disabled={!editable}
          onCheckedChange={(value) => apply([enabledEdit(element.key, value)])}
        />
      </FieldLine>
    </SectionBlock>
  );
}

/** One line of the Look section, with the colour it names where it names one. */
interface LookLine {
  readonly label: string;
  readonly value: string;
  readonly swatch?: readonly number[];
  /** The whole value where the line shows its last segment. */
  readonly full?: string;
}

/** What the element draws, in the words its class uses, read from the resolved view. */
function LookSection({ element, tree }: { element: ViewElement; tree: ViewTree }) {
  const lines = lookLines(element, tree);
  if (lines.length === 0) return null;

  return (
    <SectionBlock id="look" title={m.workshop_bin_section_look_label()}>
      {lines.map(({ label, value, swatch, full }) => (
        <FieldLine key={label} label={label}>
          {swatch !== undefined && (
            /* The swatch is the file's colour, which no token can stand for. */
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-sm border border-surface-600"
              style={{ backgroundColor: value }}
            />
          )}
          <span className="min-w-0 truncate font-mono select-text" title={full}>
            {value}
          </span>
        </FieldLine>
      ))}
    </SectionBlock>
  );
}

/**
 * The lines the Look section draws for `element`'s class. A sprite the file names is the Sprite
 * section's, so only one the controller sets at run time has a line here.
 */
function lookLines(element: ViewElement, tree: ViewTree): LookLine[] {
  const look = element.look;
  const runtime = m.workshop_bin_atlas_runtime_value();
  const runtimeSprite = { label: m.workshop_bin_atlas_sprite_label(), value: runtime };
  switch (look.kind) {
    case "icon":
      return [
        ...(look.sprite === null ? [runtimeSprite] : []),
        { label: m.workshop_bin_atlas_color_label(), value: hexOf(look.color), swatch: look.color },
      ];
    case "effect":
      return look.sprite === null ? [runtimeSprite] : [];
    case "text": {
      const font = look.font === null ? undefined : tree.view.fonts[look.font];
      return [
        {
          label: m.workshop_bin_atlas_text_key_label(),
          value: look.traKey === "" ? runtime : look.traKey,
        },
        {
          label: m.workshop_bin_atlas_font_label(),
          value: font === undefined ? runtime : lastSegment(font.path),
          full: font?.path,
        },
      ];
    }
    case "particle":
      return [{ label: m.workshop_bin_atlas_system_label(), value: look.system ?? runtime }];
    case "group": {
      const lines: LookLine[] = [
        { label: m.workshop_bin_atlas_children_label(), value: String(look.children.length) },
      ];
      if (look.layout !== null) {
        lines.push({ label: m.workshop_bin_atlas_layout_label(), value: layoutName(look.layout) });
      }
      return lines;
    }
    case "region":
    case "scissor":
    case "spine":
    case "unknown":
      return [];
  }
}

function layoutName(layout: ViewLayout): string {
  switch (layout.kind) {
    case "horizontalList":
      return m.workshop_bin_atlas_layout_horizontal_value();
    case "verticalList":
      return m.workshop_bin_atlas_layout_vertical_value();
    case "grid":
      return m.workshop_bin_atlas_layout_grid_value();
  }
}

function lastSegment(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function hexOf(color: readonly number[]): string {
  return `#${color.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

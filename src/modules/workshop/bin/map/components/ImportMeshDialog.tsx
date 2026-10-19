import { FolderOpenIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { type ReactNode, useMemo, useState } from "react";

import {
  Button,
  Checkbox,
  Dialog,
  Grid,
  IconButton,
  Inline,
  SegmentedControl,
  Stack,
  StepperField,
} from "@/components";
import { m } from "@/i18n";
import type { ModelMaterialSummary, SkippedItems, UpAxis } from "@/lib/tauri";
import type { BackdropSource } from "@/modules/viewport";
import { twMerge } from "@/utils";

import { mapQueries } from "../api/mapQueries";
import type { MeshImport, MeshImportRequest } from "../hooks/useMeshImport";
import { useMapScene } from "../state/mapScene";
import {
  ALL_LAYERS,
  defaultMaterialChoices,
  type MaterialChoice,
  type Placement,
} from "../utils/meshImport";
import { ChoicePicker } from "./ChoicePicker";
import { ImportPreview } from "./ImportPreview";

/** How many visibility layers a mesh's mask holds, one bit each. */
const LAYER_COUNT = 8;

/** The value the controller picker holds for no controller. */
const NO_CONTROLLER = "";

const SKIPPED: Record<SkippedItems["kind"], (input: { count: number }) => string> = {
  skin: m.workshop_bin_map_import_skipped_skin_label,
  blendShape: m.workshop_bin_map_import_skipped_blend_shape_label,
  camera: m.workshop_bin_map_import_skipped_camera_label,
  light: m.workshop_bin_map_import_skipped_light_label,
  animation: m.workshop_bin_map_import_skipped_animation_label,
  line: m.workshop_bin_map_import_skipped_line_label,
};

export interface ImportMeshDialogProps {
  readonly importer: MeshImport;
  readonly request: MeshImportRequest;
  /** The map that the preview draws behind the meshes. `null` if the viewport shows no map. */
  readonly backdrop: BackdropSource | null;
}

/**
 * The import dialog of a model file: its meshes, scale, up axis, a Create or Use choice per
 * material with the template and texture of a created one, the visibility of the new meshes and
 * where they stand. Per "Adding meshes" in docs/ux/MAP_EDITOR.md.
 */
export function ImportMeshDialog({ importer, request, backdrop: source }: ImportMeshDialogProps) {
  const { materials, chosen, backdrop } = useMapScene();
  const defs = useQuery(mapQueries.materialDefs(materials)).data;
  const { summary } = request;

  const [meshes, setMeshes] = useState(() => new Set(summary.meshes.map((_, at) => at)));
  const [scale, setScale] = useState(summary.scale ?? 1);
  const [up, setUp] = useState<UpAxis>(summary.up);
  const [defaults] = useState(() => defaultMaterialChoices(summary, chosen?.map ?? "", defs ?? []));
  const [choices, setChoices] = useState<MaterialChoice[]>(defaults);
  const [visibility, setVisibility] = useState(ALL_LAYERS);
  const [controller, setController] = useState(NO_CONTROLLER);
  const [placement, setPlacement] = useState<Placement>(() => {
    if (request.drop !== null) return "drop";
    return request.center === null ? "origin" : "center";
  });

  const materialChoices = useMemo(
    () => (defs ?? []).map((path) => ({ value: path, label: path })),
    [defs],
  );
  const controllerChoices = useMemo(
    () => [
      { value: NO_CONTROLLER, label: m.workshop_bin_map_mesh_no_controller_label() },
      ...backdrop.controllers.map((each) => ({ value: each.hash, label: each.name ?? each.hash })),
    ],
    [backdrop.controllers],
  );
  const placements = [
    { value: "origin" as const, label: m.workshop_bin_map_import_placement_origin_label() },
    ...(request.center === null
      ? []
      : [{ value: "center" as const, label: m.workshop_bin_map_import_placement_center_label() }]),
    ...(request.drop === null
      ? []
      : [{ value: "drop" as const, label: m.workshop_bin_map_import_placement_drop_label() }]),
  ];

  const setChoice = (at: number, choice: MaterialChoice) =>
    setChoices((held) => held.map((each, index) => (index === at ? choice : each)));
  const used = new Set(
    summary.meshes.filter((_, at) => meshes.has(at)).flatMap((mesh) => mesh.materials),
  );
  const ready =
    meshes.size > 0 &&
    choices.every((choice, at) => !used.has(at) || choice.mode === "create" || choice.material);

  const at = { origin: null, center: request.center, drop: request.drop }[placement];
  const checked = useMemo(() => [...meshes].sort((a, b) => a - b), [meshes]);

  const submit = () => {
    void importer.run({
      meshes: checked,
      scale,
      up,
      materials: choices,
      visibility,
      controller: controller === NO_CONTROLLER ? null : controller,
      at,
    });
  };

  return (
    <Dialog.Shell
      open
      onClose={() => {
        if (!importer.busy) importer.close();
      }}
      title={m.workshop_bin_map_import_title()}
      description={request.path}
      size="lg"
    >
      <Dialog.Form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Dialog.Body>
          <Stack gap={4}>
            <ImportField label={m.workshop_bin_map_import_preview_label()}>
              <ImportPreview
                backdrop={source}
                path={request.path}
                meshes={checked}
                scale={scale}
                up={up}
                at={at}
              />
            </ImportField>

            <ImportField label={m.workshop_bin_map_import_meshes_label()}>
              <Stack gap={1}>
                {summary.meshes.map((mesh, at) => (
                  <Inline key={at} gap={2} justify="between">
                    <Checkbox
                      size="sm"
                      label={mesh.name}
                      checked={meshes.has(at)}
                      onCheckedChange={(on) =>
                        setMeshes((held) => {
                          const next = new Set(held);
                          if (on) next.add(at);
                          else next.delete(at);
                          return next;
                        })
                      }
                    />
                    <span className="text-meta text-surface-400 tabular-nums">
                      {m.workshop_bin_map_import_mesh_triangles_label({ count: mesh.triangles })}
                    </span>
                  </Inline>
                ))}
              </Stack>
            </ImportField>

            <Inline gap={4}>
              <ImportField label={m.workshop_bin_map_import_scale_label()}>
                <StepperField
                  value={scale}
                  onValueChange={setScale}
                  min={0.0001}
                  step={1}
                  aria-label={m.workshop_bin_map_import_scale_label()}
                  className="w-32"
                />
              </ImportField>
              <ImportField label={m.workshop_bin_map_import_up_label()}>
                <SegmentedControl<UpAxis>
                  options={[
                    { value: "y", label: m.workshop_bin_map_import_up_y_label() },
                    { value: "z", label: m.workshop_bin_map_import_up_z_label() },
                  ]}
                  value={up}
                  onChange={setUp}
                  aria-label={m.workshop_bin_map_import_up_label()}
                />
              </ImportField>
            </Inline>

            <ImportField label={m.workshop_bin_map_import_materials_label()}>
              <Stack gap={3}>
                {summary.materials.map(
                  (material, at) =>
                    used.has(at) && (
                      <MaterialRow
                        key={at}
                        material={material}
                        choice={choices[at]}
                        fresh={defaults[at]}
                        materialChoices={materialChoices}
                        onChange={(choice) => setChoice(at, choice)}
                      />
                    ),
                )}
              </Stack>
            </ImportField>

            <ImportField label={m.workshop_bin_map_import_layers_label()}>
              <Grid columns={LAYER_COUNT} gap={1}>
                {Array.from({ length: LAYER_COUNT }, (_, bit) => (
                  <Checkbox
                    key={bit}
                    size="sm"
                    label={String(bit)}
                    checked={(visibility & (1 << bit)) !== 0}
                    onCheckedChange={(on) =>
                      setVisibility((held) => (on ? held | (1 << bit) : held & ~(1 << bit)))
                    }
                  />
                ))}
              </Grid>
            </ImportField>

            <ImportField label={m.workshop_bin_map_import_controller_label()}>
              <ChoicePicker
                choices={controllerChoices}
                value={controller}
                onPick={setController}
                label={m.workshop_bin_map_import_controller_label()}
                empty={m.workshop_bin_map_import_controller_empty()}
              />
            </ImportField>

            <ImportField label={m.workshop_bin_map_import_placement_label()}>
              <SegmentedControl<Placement>
                options={placements}
                value={placement}
                onChange={setPlacement}
                aria-label={m.workshop_bin_map_import_placement_label()}
              />
            </ImportField>

            {summary.skipped.length > 0 && (
              <ImportField label={m.workshop_bin_map_import_skipped_label()}>
                <Stack gap={0.5}>
                  {summary.skipped.map((each) => (
                    <span key={each.kind} className="text-meta text-surface-300">
                      {SKIPPED[each.kind]({ count: each.count })}
                    </span>
                  ))}
                </Stack>
              </ImportField>
            )}
          </Stack>
        </Dialog.Body>
        <Dialog.Footer>
          <Button
            size="lg"
            variant="ghost"
            type="button"
            onClick={importer.close}
            disabled={importer.busy}
          >
            {m.common_cancel_action()}
          </Button>
          <Button size="lg" type="submit" disabled={!ready} loading={importer.busy}>
            {m.workshop_bin_map_import_submit_action()}
          </Button>
        </Dialog.Footer>
      </Dialog.Form>
    </Dialog.Shell>
  );
}

/** Labeled field of the import and reimport dialogs. */
export function ImportField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack gap={1}>
      <span className="text-meta text-surface-400 select-none">{label}</span>
      {children}
    </Stack>
  );
}

interface MaterialRowProps {
  readonly material: ModelMaterialSummary;
  readonly choice: MaterialChoice;
  /** The Create choice that a switch back from Use starts from. */
  readonly fresh: MaterialChoice;
  readonly materialChoices: readonly { value: string; label: string }[];
  readonly onChange: (choice: MaterialChoice) => void;
}

/** One material of the file: Create from a template with its texture, or Use an existing one. */
function MaterialRow({ material, choice, fresh, materialChoices, onChange }: MaterialRowProps) {
  const pickTexture = async (current: Extract<MaterialChoice, { mode: "create" }>) => {
    const picked = await open({
      multiple: false,
      filters: [
        {
          name: m.workshop_bin_map_import_texture_filter(),
          extensions: ["png", "jpg", "jpeg", "tga", "bmp"],
        },
      ],
    });
    if (typeof picked === "string") onChange({ ...current, texture: picked });
  };

  return (
    <Stack gap={1.5}>
      <Inline gap={2} justify="between">
        <span className="min-w-0 truncate font-mono text-mono-row text-surface-100 select-text">
          {material.name}
        </span>
        <SegmentedControl<MaterialChoice["mode"]>
          size="sm"
          options={[
            { value: "create", label: m.workshop_bin_map_import_material_create_label() },
            { value: "use", label: m.workshop_bin_map_import_material_use_label() },
          ]}
          value={choice.mode}
          onChange={(mode) => {
            if (mode === choice.mode) return;
            onChange(mode === "create" ? fresh : { mode: "use", material: "" });
          }}
          aria-label={m.workshop_bin_map_import_material_mode_label({ name: material.name })}
        />
      </Inline>

      {choice.mode === "use" && (
        <ChoicePicker
          choices={materialChoices}
          value={choice.material}
          onPick={(picked) => onChange({ mode: "use", material: picked })}
          label={m.workshop_bin_map_import_material_mode_label({ name: material.name })}
          empty={m.workshop_bin_map_import_material_empty()}
        />
      )}
      {choice.mode === "create" && (
        <Stack gap={1}>
          <span className="truncate font-mono text-meta text-surface-300 select-text">
            {choice.name}
          </span>
          <Inline gap={2} justify="between">
            <SegmentedControl<Extract<MaterialChoice, { mode: "create" }>["template"]>
              size="sm"
              options={[
                { value: "flat", label: m.workshop_bin_map_import_template_flat_label() },
                {
                  value: "flatAlphaTest",
                  label: m.workshop_bin_map_import_template_alpha_label(),
                },
              ]}
              value={choice.template}
              onChange={(template) => onChange({ ...choice, template })}
              aria-label={m.workshop_bin_map_import_template_label({ name: material.name })}
            />
            <Inline gap={1}>
              <TextureLabel material={material} picked={choice.texture} />
              <IconButton
                icon={<FolderOpenIcon weight="bold" />}
                onClick={() => void pickTexture(choice)}
                label={m.workshop_bin_map_import_texture_pick_action()}
              />
            </Inline>
          </Inline>
        </Stack>
      )}
    </Stack>
  );
}

/** Where a created material's texture comes from, and the text tone that marks a missing file. */
function textureLabel(material: ModelMaterialSummary, picked: string | null): [string, string] {
  if (picked !== null) return [picked, "text-surface-300"];
  if (material.embedded) {
    return [m.workshop_bin_map_import_texture_embedded_label(), "text-surface-300"];
  }
  if (material.texture === null) {
    return [m.workshop_bin_map_import_texture_none_label(), "text-surface-400"];
  }
  if (material.missing) {
    const path = material.texture;
    return [m.workshop_bin_map_import_texture_missing_label({ path }), "text-warning-text"];
  }
  return [material.texture, "text-surface-300"];
}

function TextureLabel({
  material,
  picked,
}: {
  material: ModelMaterialSummary;
  picked: string | null;
}) {
  const [text, tone] = textureLabel(material, picked);
  return <span className={twMerge("min-w-0 truncate text-meta select-text", tone)}>{text}</span>;
}

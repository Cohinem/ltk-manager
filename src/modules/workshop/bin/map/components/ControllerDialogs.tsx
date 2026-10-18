import { useState } from "react";

import { Button, Checkbox, Dialog, Field, FormField, Grid, SelectField, Stack } from "@/components";
import { m } from "@/i18n";
import type { MapController, MapParentMode } from "@/lib/tauri";

import { nameHash } from "../../shared/utils/binHash";
import { useVisibilityAuthoring } from "../hooks/useVisibilityAuthoring";
import { useMapScene } from "../state/mapScene";
import { controllerLabel, layerName } from "../utils/mapControllers";
import { CONTROLLER_KINDS, type ControllerKind, PARENT_MODES } from "../utils/visibilityAuthoring";

/** How many bits a layer mask holds. */
const LAYER_COUNT = 8;

/** The `ParentMode` value of each mode that the backend reads. */
const MODE_VALUES: Record<MapParentMode, number> = {
  all: 0,
  any: 1,
  one: 2,
  none: 3,
};

function kindLabel(kind: ControllerKind): string {
  switch (kind) {
    case "named":
      return m.workshop_bin_map_visibility_kind_named_label();
    case "terrain":
      return m.workshop_bin_map_visibility_kind_terrain_label();
    case "stage":
      return m.workshop_bin_map_visibility_kind_stage_label();
    case "child":
      return m.workshop_bin_map_visibility_kind_child_label();
    case "mutator":
      return m.workshop_bin_map_visibility_kind_mutator_label();
    case "layer":
      return m.workshop_bin_map_visibility_kind_layer_label();
    case "driver":
      return m.workshop_bin_map_visibility_kind_driver_label();
  }
}

/** The label of the `ParentMode` value `mode`. */
function modeLabel(mode: number): string {
  switch (mode) {
    case 0:
      return m.workshop_bin_map_visibility_mode_all_label();
    case 1:
      return m.workshop_bin_map_visibility_mode_any_label();
    case 2:
      return m.workshop_bin_map_visibility_mode_one_label();
    default:
      return m.workshop_bin_map_visibility_mode_none_label();
  }
}

/** The label of the mask byte that `kind` writes, and null for a kind that writes none. */
function maskLabel(kind: ControllerKind): string | null {
  switch (kind) {
    case "terrain":
      return m.workshop_bin_map_visibility_terrain_mask_label();
    case "stage":
      return m.workshop_bin_map_visibility_stage_mask_label();
    case "layer":
      return m.workshop_bin_map_visibility_layer_mask_label();
    default:
      return null;
  }
}

/** The description of the mask byte that `kind` writes, and undefined for a kind with none. */
function maskDescription(kind: ControllerKind): string | undefined {
  switch (kind) {
    case "terrain":
      return m.workshop_bin_map_visibility_terrain_mask_description();
    case "stage":
      return m.workshop_bin_map_visibility_stage_mask_description();
    default:
      return undefined;
  }
}

interface MaskFieldProps {
  readonly label: string;
  readonly description?: string;
  readonly mask: number;
  /** The `PublicName` of each layer bit that the map names. */
  readonly names: ReadonlyMap<number, string>;
  readonly onChange: (mask: number) => void;
}

/** A byte as one checkbox per bit, each named by its layer. */
function MaskField({ label, description, mask, names, onChange }: MaskFieldProps) {
  return (
    <Field.Root label={label} description={description}>
      <Grid columns={2} gap={1.5}>
        {Array.from({ length: LAYER_COUNT }, (_, index) => (
          <Checkbox
            key={index}
            size="sm"
            label={layerName(names, index)}
            checked={(mask & (1 << index)) !== 0}
            onCheckedChange={(checked) =>
              onChange(checked ? mask | (1 << index) : mask & ~(1 << index))
            }
          />
        ))}
      </Grid>
    </Field.Root>
  );
}

interface ParentsFieldsProps {
  /** The controllers that can be a parent. */
  readonly controllers: readonly MapController[];
  readonly parents: readonly string[];
  readonly mode: number;
  readonly onParents: (parents: string[]) => void;
  readonly onMode: (mode: number) => void;
}

/** The parents of a child controller, as a checkbox per controller, and its `ParentMode`. */
function ParentsFields({ controllers, parents, mode, onParents, onMode }: ParentsFieldsProps) {
  return (
    <>
      <Field.Root label={m.workshop_bin_map_visibility_parents_label()}>
        {/* DS-SCROLLBAR */}
        <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto scrollbar-md">
          {controllers.map((controller) => (
            <Checkbox
              key={controller.hash}
              size="sm"
              label={controllerLabel(controller)}
              checked={parents.includes(controller.hash)}
              onCheckedChange={(checked) =>
                onParents(
                  checked
                    ? [...parents, controller.hash]
                    : parents.filter((parent) => parent !== controller.hash),
                )
              }
            />
          ))}
        </div>
      </Field.Root>
      <SelectField
        label={m.workshop_bin_map_visibility_mode_label()}
        options={PARENT_MODES.map((value) => ({
          value: String(value),
          label: modeLabel(value),
        }))}
        value={String(mode)}
        onValueChange={(value) => onMode(Number(value ?? 0))}
      />
    </>
  );
}

/** Creates a visibility controller of a chosen kind in the scene's `.materials.bin`. */
export function NewControllerDialog({ onClose }: { onClose: () => void }) {
  const { chosen, backdrop } = useMapScene();
  const authoring = useVisibilityAuthoring();
  const [kind, setKind] = useState<ControllerKind>("named");
  const [name, setName] = useState("");
  const [defaultVisible, setDefaultVisible] = useState(true);
  const [mask, setMask] = useState(0);
  const [parents, setParents] = useState<string[]>([]);
  const [mode, setMode] = useState(0);
  const [mutator, setMutator] = useState("");
  const [pending, setPending] = useState(false);

  const trimmed = name.trim();
  const path = chosen === null ? null : `${chosen.map}/Controllers/${trimmed}`;
  const taken =
    path !== null && backdrop.controllers.some((controller) => controller.hash === nameHash(path));
  const ready = path !== null && trimmed !== "" && !taken;
  const named = kind === "named" || kind === "terrain" || kind === "stage";
  const bits = maskLabel(kind);

  async function submit() {
    if (!ready || path === null) return;

    setPending(true);
    const created = await authoring.create(path, {
      kind,
      name: trimmed,
      defaultVisible,
      mask,
      parents,
      mode,
      mutator,
    });
    setPending(false);
    if (created) onClose();
  }

  return (
    <Dialog.Shell
      open
      onClose={() => {
        if (!pending) onClose();
      }}
      title={m.workshop_bin_map_visibility_new_title()}
      size="sm"
    >
      <Dialog.Form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Dialog.Body>
          <Stack gap={4}>
            <SelectField
              label={m.workshop_bin_map_visibility_kind_label()}
              options={CONTROLLER_KINDS.map((each) => ({
                value: each,
                label: kindLabel(each),
              }))}
              value={kind}
              onValueChange={(value) => {
                if (value !== null) setKind(value as ControllerKind);
              }}
            />
            <FormField
              label={m.workshop_bin_map_visibility_name_label()}
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={taken ? m.workshop_bin_map_visibility_name_taken_error() : undefined}
              autoFocus
              className="font-mono"
            />
            {named && (
              <Checkbox
                size="sm"
                label={m.workshop_bin_map_visibility_default_visible_label()}
                checked={defaultVisible}
                onCheckedChange={setDefaultVisible}
              />
            )}
            {bits !== null && (
              <MaskField
                label={bits}
                description={maskDescription(kind)}
                mask={mask}
                names={backdrop.flagNames}
                onChange={setMask}
              />
            )}
            {kind === "child" && (
              <ParentsFields
                controllers={backdrop.controllers}
                parents={parents}
                mode={mode}
                onParents={setParents}
                onMode={setMode}
              />
            )}
            {kind === "mutator" && (
              <FormField
                label={m.workshop_bin_map_visibility_mutator_label()}
                value={mutator}
                onChange={(event) => setMutator(event.target.value)}
                className="font-mono"
              />
            )}
          </Stack>
        </Dialog.Body>
        <Dialog.Footer>
          <Button size="lg" variant="ghost" type="button" onClick={onClose} disabled={pending}>
            {m.common_cancel_action()}
          </Button>
          <Button size="lg" type="submit" disabled={!ready} loading={pending}>
            {m.workshop_bin_map_visibility_create_action()}
          </Button>
        </Dialog.Footer>
      </Dialog.Form>
    </Dialog.Shell>
  );
}

export interface ParentsDialogProps {
  /** A child controller. */
  readonly controller: MapController;
  readonly onClose: () => void;
}

/** Edits the parents and the `ParentMode` of a child controller as one undo step. */
export function ParentsDialog({ controller, onClose }: ParentsDialogProps) {
  const { backdrop } = useMapScene();
  const authoring = useVisibilityAuthoring();
  const { rule } = controller;
  const held = rule.kind === "child" ? rule.parents : [];
  const [parents, setParents] = useState<string[]>(held);
  const [mode, setMode] = useState(rule.kind === "child" ? MODE_VALUES[rule.mode] : 0);
  const [pending, setPending] = useState(false);
  const others = backdrop.controllers.filter((each) => each.hash !== controller.hash);

  async function submit() {
    setPending(true);
    const saved = await authoring.setParents(controller.hash, held.length, parents, mode);
    setPending(false);
    if (saved) onClose();
  }

  return (
    <Dialog.Shell
      open
      onClose={() => {
        if (!pending) onClose();
      }}
      title={m.workshop_bin_map_visibility_parents_title({
        name: controllerLabel(controller),
      })}
      size="sm"
    >
      <Dialog.Form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Dialog.Body>
          <Stack gap={4}>
            <ParentsFields
              controllers={others}
              parents={parents}
              mode={mode}
              onParents={setParents}
              onMode={setMode}
            />
          </Stack>
        </Dialog.Body>
        <Dialog.Footer>
          <Button size="lg" variant="ghost" type="button" onClick={onClose} disabled={pending}>
            {m.common_cancel_action()}
          </Button>
          <Button size="lg" type="submit" loading={pending}>
            {m.workshop_bin_map_visibility_parents_save_action()}
          </Button>
        </Dialog.Footer>
      </Dialog.Form>
    </Dialog.Shell>
  );
}

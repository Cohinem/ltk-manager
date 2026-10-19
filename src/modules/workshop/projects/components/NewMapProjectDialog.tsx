import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { z } from "zod";

import { Button, Dialog, Field, Grid, RadioGroup, Select, Stack } from "@/components";
import { errorSummary, m } from "@/i18n";
import { useAppForm } from "@/lib/form";
import type { MapStart, MapStartingPoint } from "@/lib/tauri";
import { useSettings } from "@/modules/settings";
import { useDialog } from "@/stores";
import { toSlug } from "@/utils";

import { objectDocument } from "../../documents/utils/contentDocument";
import { useLastAuthorName, useNewMapProjectDialog, useWorkshopEditorStore } from "../../state";
import { useCreateMapProject, useMapStarts } from "../api/useMapProject";
import { skinOf } from "../utils/mapSkin";
import { projectSlugSchema } from "../utils/projectSlug";

const mapProjectSchema = z.object({
  displayName: z.string().min(1),
  name: projectSlugSchema,
});

/** Display names of the supported maps, by map id. */
const MAP_NAMES: Record<string, () => string> = {
  Map11: m.workshop_map_project_map_summoners_rift_label,
  Map12: m.workshop_map_project_map_howling_abyss_label,
  Map30: m.workshop_map_project_map_arena_label,
};

const STARTS: readonly {
  value: MapStartingPoint;
  title: () => string;
  description: () => string;
}[] = [
  {
    value: "shipped",
    title: m.workshop_map_project_start_shipped_label,
    description: m.workshop_map_project_start_shipped_description,
  },
  {
    value: "skin",
    title: m.workshop_map_project_start_skin_label,
    description: m.workshop_map_project_start_skin_description,
  },
  {
    value: "geometry",
    title: m.workshop_map_project_start_geometry_label,
    description: m.workshop_map_project_start_geometry_description,
  },
];

/** New map project dialog. Per "Starting a map" in docs/ux/MAP_EDITOR.md. */
export function NewMapProjectDialog() {
  const { isOpen, close } = useDialog(useNewMapProjectDialog);
  const navigate = useNavigate();
  const starts = useMapStarts(isOpen);
  const create = useCreateMapProject();
  const { data: settings } = useSettings();
  const lastAuthorName = useLastAuthorName();
  const [mapId, setMapId] = useState<string | null>(null);
  const [skinName, setSkinName] = useState<string | null>(null);
  const [start, setStart] = useState<MapStartingPoint>("skin");
  const nameEdited = useRef(false);

  const error = starts.error ?? create.error;
  const maps = starts.data ?? [];
  const map = maps.find((each) => each.map === mapId) ?? maps[0] ?? null;
  const skin = skinOf(map, skinName);
  const author =
    settings?.authorProfiles.find((profile) => profile.id === settings.defaultAuthorProfileId)
      ?.name ?? lastAuthorName;

  const form = useAppForm({
    defaultValues: { displayName: "", name: "" },
    validators: { onChange: mapProjectSchema },
    onSubmit: ({ value }) => {
      if (map === null || skin === null) return;

      create.mutate(
        {
          args: {
            name: value.name,
            displayName: value.displayName,
            description: "",
            authors: author ? [author] : [],
          },
          map: map.map,
          skin,
          start,
        },
        {
          onSuccess: ({ project, container }) => {
            useWorkshopEditorStore
              .getState()
              .openDocument(
                project.path,
                objectDocument(
                  container.asset,
                  container.entry,
                  container.path,
                  container.file,
                  "MapContainer",
                ),
              );
            handleClose();
            void navigate({ to: "/workshop/$projectId", params: { projectId: project.id } });
          },
        },
      );
    },
  });

  function handleClose() {
    if (create.isPending) return;

    create.reset();
    form.reset();
    nameEdited.current = false;
    setMapId(null);
    setSkinName(null);
    setStart("skin");
    close();
  }

  return (
    <Dialog.Shell
      open={isOpen}
      onClose={handleClose}
      title={m.workshop_map_project_title()}
      size="xl"
      closable={!create.isPending}
    >
      <Dialog.Form
        onSubmit={(event) => {
          event.preventDefault();
          form.handleSubmit();
        }}
      >
        <Dialog.Body>
          <Stack gap={5}>
            <Stack gap={2}>
              <Grid columns={2} gap={3} align="start">
                <form.AppField
                  name="displayName"
                  listeners={{
                    onChange: ({ value }) => {
                      if (!nameEdited.current) form.setFieldValue("name", toSlug(value));
                    },
                  }}
                >
                  {(field) => (
                    <field.TextField
                      label={m.workshop_map_project_display_name_label()}
                      required
                      autoFocus
                      disabled={create.isPending}
                    />
                  )}
                </form.AppField>

                <form.AppField
                  name="name"
                  listeners={{
                    onChange: () => {
                      nameEdited.current = true;
                    },
                  }}
                >
                  {(field) => (
                    <field.TextField
                      label={m.workshop_map_project_name_label()}
                      required
                      disabled={create.isPending}
                      transform={(value) => value.toLowerCase()}
                      inputClassName="font-mono"
                    />
                  )}
                </form.AppField>
              </Grid>
              <p className="text-meta text-surface-500 select-none">
                {m.workshop_map_project_name_hint()}
              </p>
            </Stack>

            <MapChoice
              maps={maps}
              map={map}
              skin={skin}
              loading={starts.isPending}
              disabled={create.isPending}
              onMap={(next) => {
                setMapId(next);
                setSkinName(null);
              }}
              onSkin={setSkinName}
            />

            <RadioGroup.Root
              label={m.workshop_map_project_start_label()}
              value={start}
              onValueChange={(value: unknown) => setStart(value as MapStartingPoint)}
            >
              <RadioGroup.Options orientation="vertical">
                {STARTS.map((each) => (
                  <RadioGroup.Card
                    key={each.value}
                    value={each.value}
                    disabled={create.isPending}
                    title={each.title()}
                    description={each.description()}
                  />
                ))}
              </RadioGroup.Options>
            </RadioGroup.Root>

            {error && <p className="text-sm text-danger-text select-text">{errorSummary(error)}</p>}
          </Stack>
        </Dialog.Body>

        <Dialog.Footer>
          <Button size="lg" variant="ghost" onClick={handleClose} disabled={create.isPending}>
            {m.common_cancel_action()}
          </Button>
          <form.Subscribe selector={(state) => state.canSubmit && state.isValid}>
            {(canSubmit) => (
              <Button
                size="lg"
                variant="filled"
                type="submit"
                loading={create.isPending}
                disabled={!canSubmit || skin === null || create.isPending}
              >
                {m.workshop_map_project_create_action()}
              </Button>
            )}
          </form.Subscribe>
        </Dialog.Footer>
      </Dialog.Form>
    </Dialog.Shell>
  );
}

interface MapChoiceProps {
  maps: readonly MapStart[];
  map: MapStart | null;
  skin: string | null;
  loading: boolean;
  disabled: boolean;
  onMap: (map: string) => void;
  onSkin: (skin: string) => void;
}

/** Map and skin pickers. */
function MapChoice({ maps, map, skin, loading, disabled, onMap, onSkin }: MapChoiceProps) {
  if (loading) {
    return (
      <p className="text-sm text-surface-400 select-none">
        {m.workshop_map_project_loading_hint()}
      </p>
    );
  }
  if (map === null) {
    return (
      <p className="text-sm text-surface-400 select-none">
        {m.workshop_map_project_no_maps_hint()}
      </p>
    );
  }

  return (
    <Grid columns={2} gap={3} align="start">
      <Field.Root>
        <Field.Label>{m.workshop_map_project_map_label()}</Field.Label>
        <Select.Root
          value={map.map}
          disabled={disabled}
          onValueChange={(value) => value !== null && onMap(value)}
        >
          <Select.Trigger>
            <Select.Value>{mapName(map.map)}</Select.Value>
            <Select.Icon />
          </Select.Trigger>
          <Select.Content>
            {maps.map((each) => (
              <Select.Item key={each.map} value={each.map}>
                {mapName(each.map)}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </Field.Root>

      <Field.Root>
        <Field.Label>{m.workshop_map_project_skin_label()}</Field.Label>
        <Select.Root
          value={skin}
          disabled={disabled}
          onValueChange={(value) => value !== null && onSkin(value)}
        >
          <Select.Trigger>
            <Select.Value>{skin}</Select.Value>
            <Select.Icon />
          </Select.Trigger>
          <Select.Content>
            {map.skins.map((each) => (
              <Select.Item key={each.skin} value={each.skin}>
                {each.skin}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </Field.Root>
    </Grid>
  );
}

/** Returns the display name of map `id`, or `id` if it has none. */
function mapName(id: string): string {
  return MAP_NAMES[id]?.() ?? id;
}

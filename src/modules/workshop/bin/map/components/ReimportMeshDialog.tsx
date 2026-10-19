import { useState } from "react";

import { Button, Dialog, Inline, SegmentedControl, Stack, StepperField } from "@/components";
import { m } from "@/i18n";
import type { UpAxis } from "@/lib/tauri";

import { useMapScene } from "../state/mapScene";
import { type ReimportRequest, reimportEdit } from "../utils/meshImport";
import { meshId } from "../utils/meshSelection";
import { ChoicePicker } from "./ChoicePicker";
import { ImportField } from "./ImportMeshDialog";

export interface ReimportMeshDialogProps {
  readonly request: ReimportRequest;
}

/**
 * Reimport dialog for one map mesh, with the source mesh, scale and up axis. Preselects the
 * matched source mesh. Per "Adding meshes" in docs/ux/MAP_EDITOR.md.
 */
export function ReimportMeshDialog({ request }: ReimportMeshDialogProps) {
  const { importMeshes, select, setReimport } = useMapScene();
  const { summary } = request;
  const [source, setSource] = useState(request.source ?? 0);
  const [scale, setScale] = useState(summary.scale ?? 1);
  const [up, setUp] = useState<UpAxis>(summary.up);
  const [busy, setBusy] = useState(false);

  const close = () => {
    if (!busy) setReimport(null);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const deltas = await importMeshes([], reimportEdit(request, source, scale, up));
      if (deltas === null) return;

      select(
        deltas.flatMap((delta) => (delta.kind === "insert" ? [meshId(delta.mesh)] : [])),
        "replace",
      );
      setReimport(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Shell
      open
      onClose={close}
      title={m.workshop_bin_map_reimport_title()}
      description={request.path}
    >
      <Dialog.Form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Dialog.Body>
          <Stack gap={4}>
            {request.source === null && (
              <span className="text-meta text-warning-text select-none">
                {m.workshop_bin_map_reimport_unmatched_hint()}
              </span>
            )}
            <ImportField label={m.workshop_bin_map_reimport_source_label()}>
              <ChoicePicker
                choices={summary.meshes.map((mesh, at) => ({
                  value: String(at),
                  label: mesh.name,
                }))}
                value={String(source)}
                onPick={(picked) => setSource(Number(picked))}
                label={m.workshop_bin_map_reimport_source_label()}
                empty={m.workshop_bin_map_reimport_source_empty()}
              />
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
          </Stack>
        </Dialog.Body>
        <Dialog.Footer>
          <Button size="lg" variant="ghost" type="button" onClick={close} disabled={busy}>
            {m.common_cancel_action()}
          </Button>
          <Button size="lg" type="submit" loading={busy}>
            {m.workshop_bin_map_reimport_submit_action()}
          </Button>
        </Dialog.Footer>
      </Dialog.Form>
    </Dialog.Shell>
  );
}

import { CaretDownIcon } from "@phosphor-icons/react";

import { Button, Code, Menu, SeverityGlyph, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { BinDocumentId, DeclaredDiagnostic, DeclaredMark, DeclaredState } from "@/lib/tauri";

import { layerTitle } from "../../../documents/utils/contentDocument";
import { LayerGlyph } from "../../../layers/components/LayerGlyph";
import { useProjectContext } from "../../../projects/state/ProjectContext";
import { useSelectedLayerName, useSelectLayer } from "../../../state";
import { useDeclareInto } from "../hooks/useDeclared";
import { diagnosticSeverity, diagnosticText } from "../utils/declaredDiagnostics";

interface DeclaredLayerChipProps {
  document: BinDocumentId;
  declared: DeclaredState;
}

/**
 * The layer a declared document's edits write to, and the menu that switches it. The
 * choice is the project's selected layer, so it holds across tabs and sessions.
 * "Declaring from a game bin" in docs/ux/BIN_EDITOR.md.
 */
export function DeclaredLayerChip({ document, declared }: DeclaredLayerChipProps) {
  const project = useProjectContext();
  const selectLayer = useSelectLayer();
  useDeclareInto(document, declared, useSelectedLayerName());

  return (
    <span className="flex shrink-0 items-center gap-1">
      <DeclaredDiagnosticsMark
        diagnostics={declared.diagnostics.filter((diagnostic) => diagnostic.entry.length === 0)}
      />
      <Menu.Root>
        <Tooltip content={m.workshop_bin_declares_into_hint()}>
          <Menu.Trigger
            render={
              <Button
                variant="ghost"
                size="xs"
                compact
                aria-label={m.workshop_bin_declares_into_label()}
                left={<LayerGlyph layerName={declared.layer} />}
                right={<CaretDownIcon weight="bold" className="h-3 w-3" />}
              >
                {layerTitle(project, declared.layer)}
              </Button>
            }
          />
        </Tooltip>
        <Menu.Portal>
          <Menu.Positioner align="end">
            <Menu.Popup
              data-ui="DeclaredLayerMenu"
              className="max-h-96 w-56 overflow-y-auto scrollbar-md"
            >
              <Menu.RadioGroup
                value={declared.layer}
                onValueChange={(layer) => selectLayer(layer as string)}
              >
                {declared.layers.map((layer) => (
                  <Menu.RadioItem key={layer} value={layer}>
                    {layerTitle(project, layer)}
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </span>
  );
}

interface DeclaredDiagnosticsMarkProps {
  diagnostics: readonly DeclaredDiagnostic[];
}

/**
 * What the last apply reported about one row, or about nothing the tree draws: the worst
 * of them as a glyph, and each with its key and its layer on hover.
 */
export function DeclaredDiagnosticsMark({ diagnostics }: DeclaredDiagnosticsMarkProps) {
  const project = useProjectContext();
  if (diagnostics.length === 0) return null;
  const severity = diagnostics.some((one) => diagnosticSeverity(one) === "warning")
    ? "warning"
    : "info";

  return (
    <Tooltip
      content={
        <span className="flex flex-col gap-1.5">
          {diagnostics.map((diagnostic) => (
            <span key={`${diagnostic.layer}:${diagnostic.key}`} className="flex flex-col gap-0.5">
              <span>{diagnosticText(diagnostic)}</span>
              <span className="flex items-baseline gap-1.5 text-surface-400">
                <Code>{diagnostic.key}</Code>
                {layerTitle(project, diagnostic.layer)}
              </span>
              {diagnostic.detail !== null && <span>{diagnostic.detail}</span>}
            </span>
          ))}
        </span>
      }
    >
      <span
        role="img"
        aria-label={m.workshop_bin_declared_diagnostics_label({ count: diagnostics.length })}
        className="flex shrink-0"
      >
        <SeverityGlyph severity={severity} />
      </span>
    </Tooltip>
  );
}

interface DeclaredRowMarkProps {
  mark: DeclaredMark;
  /** The layer the mark's declaration is in. */
  layer: string;
}

/** The mark on a row a declaration of the chosen layer touches, with the game's value on hover. */
export function DeclaredRowMark({ mark, layer }: DeclaredRowMarkProps) {
  const project = useProjectContext();
  const label = m.workshop_bin_declared_row_label({ layer: layerTitle(project, layer) });

  return (
    <Tooltip
      content={
        <span className="flex flex-col gap-1">
          <span>{label}</span>
          {mark.whole && <span>{m.workshop_bin_declared_whole_hint()}</span>}
          {mark.game !== null && (
            <span className="flex items-baseline gap-1.5">
              {m.workshop_bin_declared_game_value_label()}
              <Code>{mark.game}</Code>
            </span>
          )}
        </span>
      }
    >
      <span role="img" aria-label={label} className="flex shrink-0">
        {/* DS-KIND-HUE */}
        <LayerGlyph layerName={layer} className="h-3 w-3" />
      </span>
    </Tooltip>
  );
}

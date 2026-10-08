import {
  ArrowSquareOutIcon,
  EyeIcon,
  EyeSlashIcon,
  MinusIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { type MouseEvent, type ReactNode, useMemo } from "react";

import { Checkbox, Count, IconButton, OVERLINE, Stack, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { MapController } from "@/lib/tauri";
import type { BackdropFlags, ControllerUse } from "@/modules/viewport";
import { twMerge } from "@/utils";

import {
  type ControllerDependent,
  type ControllerEntry,
  controllerLabel,
  controllerSections,
  groupLabel,
  materialName,
  ruleTitle,
} from "../utils/mapControllers";

/** The most material names the tooltip of a mesh count lists. */
const MATERIALS_LISTED = 8;

export interface BackdropVisibilityListProps {
  /** The layers, the controllers and their states, as `useBackdropFlags` returns them. */
  readonly backdrop: BackdropFlags;
  /**
   * Opens the object of the controller `hash` for editing. Absent if there is no editor
   * tab to open the map's `.materials.bin` in.
   */
  readonly onOpenController?: (hash: string, event: MouseEvent) => void;
}

/** What every controller row reads, passed down the nested rows as one value. */
interface RowContext {
  readonly states: ReadonlyMap<string, boolean>;
  readonly overrides: ReadonlyMap<string, boolean>;
  readonly uses: ReadonlyMap<string, ControllerUse>;
  readonly onChange: (hash: string, visible: boolean) => void;
  readonly onOpen?: (hash: string, event: MouseEvent) => void;
}

/**
 * The layers and the visibility controllers of a map backdrop.
 *
 * A layer has a checkbox that changes the active flags. A controller that depends on no
 * other controller has a checkbox that sets its state, and is listed in the section of its
 * kind. A controller that depends on others has no checkbox. It is listed under each
 * controller it depends on, with a mark for whether it is shown or hidden while that
 * controller is shown, and an icon for its current state.
 */
export function BackdropVisibilityList({
  backdrop,
  onOpenController,
}: BackdropVisibilityListProps) {
  const { layers, flags, setLayer, controllers, visibility, uses, overrides, setController } =
    backdrop;
  const sections = useMemo(() => controllerSections(controllers), [controllers]);
  const context = useMemo<RowContext>(
    () => ({
      states: visibility.controllers,
      overrides,
      uses,
      onChange: setController,
      onOpen: onOpenController,
    }),
    [visibility.controllers, overrides, uses, setController, onOpenController],
  );

  return (
    <Stack gap={3}>
      <Section title={m.workshop_bin_preview_backdrop_layers_label()}>
        {layers.length === 0 && (
          <Empty text={m.workshop_bin_preview_backdrop_layers_empty_label()} />
        )}
        {layers.map((layer) => {
          const label = m.workshop_bin_preview_backdrop_layer_label({ number: layer.index + 1 });
          return (
            <Row key={layer.index}>
              <Checkbox
                size="sm"
                aria-label={label}
                checked={(flags & (1 << layer.index)) !== 0}
                onCheckedChange={(checked) => setLayer(layer.index, checked)}
              />
              <span className="min-w-0 flex-1 truncate text-surface-100">{label}</span>
              <Count>
                {m.workshop_bin_preview_backdrop_layer_triangles_label({
                  count: layer.triangles,
                  formatted: layer.triangles.toLocaleString(),
                })}
              </Count>
            </Row>
          );
        })}
      </Section>

      {controllers.length === 0 && (
        <Section title={m.workshop_bin_preview_backdrop_controllers_label()}>
          <Empty text={m.workshop_bin_preview_backdrop_controllers_empty_label()} />
        </Section>
      )}
      {sections.map((section) => (
        <Section key={section.group} title={groupLabel(section.group)}>
          {section.entries.map((entry) => (
            <EntryRows key={entry.controller.hash} entry={entry} context={context} />
          ))}
        </Section>
      ))}
    </Stack>
  );
}

/** A titled group of rows. The negative margin extends the hover fill of a row into the container's padding. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack as="section" gap={1}>
      <h3 className={OVERLINE}>{title}</h3>
      <div className="-mx-1.5 flex flex-col">{children}</div>
    </Stack>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-1.5 text-meta text-surface-400">{text}</p>;
}

/** One row with a checkbox: a label that toggles it, and an optional action after it. */
function Row({ action, children }: { action?: ReactNode; children: ReactNode }) {
  return (
    /* DS-VEIL, DS-POPUP, DS-REVEAL */
    <div className="group/reveal flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-1.5 text-meta hover:bg-surface-veil-soft">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">{children}</label>
      {action}
    </div>
  );
}

/**
 * An independent controller and, indented under it, the controllers that depend on it.
 *
 * The row shows the title of its rule, then its name or path hash, then its mesh count.
 * The title has the accent while the reader's override is set.
 */
function EntryRows({ entry, context }: { entry: ControllerEntry; context: RowContext }) {
  const { controller, dependents } = entry;
  const label = controllerLabel(controller);
  const title = ruleTitle(controller.rule);
  const overridden = context.overrides.has(controller.hash);

  return (
    <>
      <Row action={<OpenAction controller={controller} onOpen={context.onOpen} />}>
        <Checkbox
          size="sm"
          aria-label={title === null ? label : `${title} ${label}`}
          checked={context.states.get(controller.hash) === true}
          onCheckedChange={(visible) => context.onChange(controller.hash, visible)}
        />
        {title !== null && (
          <span className={twMerge("shrink-0 text-surface-100", overridden && "text-accent-300")}>
            {title}
          </span>
        )}
        <span
          className={twMerge(
            "min-w-0 flex-1 truncate tabular-nums",
            title === null ? "text-surface-100" : "text-surface-400",
            title === null && overridden && "text-accent-300",
          )}
        >
          {label}
        </span>
        <MeshCount use={context.uses.get(controller.hash)} />
      </Row>
      <Dependents dependents={dependents} parent={title ?? label} context={context} first />
    </>
  );
}

interface DependentsProps {
  readonly dependents: readonly ControllerDependent[];
  /** The display text of the controller that these depend on. */
  readonly parent: string;
  readonly context: RowContext;
  /** The rows are directly under a row with a checkbox, and indent to its text. */
  readonly first?: boolean;
}

/** The controllers that depend on one controller, indented under it, each with its own. */
function Dependents({ dependents, parent, context, first = false }: DependentsProps) {
  if (dependents.length === 0) return null;

  return (
    <div className={twMerge("flex flex-col", first ? "pl-7.5" : "pl-4.5")}>
      {dependents.map((dependent) => (
        <DependentRows
          key={dependent.controller.hash}
          dependent={dependent}
          parent={parent}
          context={context}
        />
      ))}
    </div>
  );
}

interface DependentRowsProps {
  readonly dependent: ControllerDependent;
  readonly parent: string;
  readonly context: RowContext;
}

/**
 * A controller that depends on the controller above it: a plus if it is shown while that
 * controller is shown and a minus if it is hidden, then its name or path hash, its mesh
 * count and an eye for its current state. It has no checkbox, because its state is
 * computed.
 */
function DependentRows({ dependent, parent, context }: DependentRowsProps) {
  const { controller, relation, dependents } = dependent;
  const label = controllerLabel(controller);
  const shown = context.states.get(controller.hash) === true;
  const Mark = relation === "with" ? PlusIcon : MinusIcon;
  const hint =
    relation === "with"
      ? m.workshop_bin_preview_backdrop_controller_with_hint({ parent })
      : m.workshop_bin_preview_backdrop_controller_unless_hint({ parent });
  const state = shown
    ? m.workshop_bin_preview_backdrop_controller_shown_label()
    : m.workshop_bin_preview_backdrop_controller_hidden_label();
  const Eye = shown ? EyeIcon : EyeSlashIcon;

  return (
    <>
      {/* DS-VEIL, DS-POPUP, DS-REVEAL */}
      <div
        className={twMerge(
          "group/reveal flex h-6 shrink-0 items-center gap-1.5 rounded-lg pr-1.5 pl-1 text-meta hover:bg-surface-veil-soft",
          shown ? "text-surface-200" : "text-surface-500",
        )}
      >
        <Tooltip content={hint}>
          <span aria-label={hint} className="flex shrink-0 text-surface-400">
            <Mark weight="bold" className="size-3" />
          </span>
        </Tooltip>
        <span className="min-w-0 flex-1 truncate tabular-nums">{label}</span>
        <MeshCount use={context.uses.get(controller.hash)} />
        <Tooltip content={state}>
          <span aria-label={state} className="flex shrink-0">
            <Eye weight="bold" className="size-3.5" />
          </span>
        </Tooltip>
        <OpenAction controller={controller} onOpen={context.onOpen} />
      </div>
      <Dependents dependents={dependents} parent={label} context={context} />
    </>
  );
}

interface OpenActionProps {
  readonly controller: MapController;
  readonly onOpen?: (hash: string, event: MouseEvent) => void;
}

/** The button that opens a controller object, and nothing without an open handler. */
function OpenAction({ controller, onOpen }: OpenActionProps) {
  if (onOpen === undefined) return null;

  return (
    <IconButton
      reveal
      muted
      size="row"
      icon={<ArrowSquareOutIcon />}
      label={m.workshop_bin_preview_backdrop_controller_open_action()}
      onClick={(event) => onOpen(controller.hash, event)}
    />
  );
}

/** Names in a column, for a tooltip, and how many more there are where the column is cut. */
function Names({ names, more = 0 }: { names: readonly string[]; more?: number }) {
  return (
    <span className="flex flex-col text-fine">
      {names.map((name) => (
        <span key={name}>{name}</span>
      ))}
      {more > 0 && (
        <span className="text-surface-400">
          {m.workshop_bin_preview_backdrop_controller_materials_more_label({ count: more })}
        </span>
      )}
    </span>
  );
}

/**
 * The mesh count of a controller, with the material names of those meshes in a tooltip.
 * Nothing for a controller that no mesh references.
 */
function MeshCount({ use }: { use: ControllerUse | undefined }) {
  if (use === undefined) return null;

  const more = use.materials.length - MATERIALS_LISTED;

  return (
    <Tooltip
      side="left"
      content={
        <Names
          names={use.materials.slice(0, MATERIALS_LISTED).map(materialName)}
          more={Math.max(more, 0)}
        />
      }
    >
      <span className="shrink-0">
        <Count>
          {m.workshop_bin_preview_backdrop_controller_meshes_label({ count: use.meshes })}
        </Count>
      </span>
    </Tooltip>
  );
}

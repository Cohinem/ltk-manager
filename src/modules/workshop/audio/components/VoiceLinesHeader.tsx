import { WarningIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { Badge, Code, Inline, SearchField, Select, TogglePill, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { Audience, VoiceLinesResponse, VoiceSkin } from "@/lib/tauri";

import { ShellHeaderPortal } from "../../bin/shell/state/shellHeader";
import { skinLabel } from "../utils/voiceLines";
import type { TriggerContext } from "../utils/voiceTrigger";
import { TextControl } from "./VoiceFieldRows";
import { audienceLabel } from "./VoiceLineRows";

/** The value of a trigger picker that tests no champion or spell. */
const ANY = "";

const AUDIENCES: readonly Audience[] = ["owner", "ally", "enemy", "spectator"];

const LABEL_CLASSES = "shrink-0 text-meta text-surface-400";

interface VoiceLinesHeaderProps {
  readonly data: VoiceLinesResponse;
  readonly onSkin: (bin: string) => void;
  /** Sets `mCooldown`, or null while the document takes no edit. */
  readonly onCooldown: ((seconds: number) => Promise<boolean>) | null;
  readonly filter: string;
  readonly onFilter: (text: string) => void;
  readonly unresolved: number;
  readonly onlyUnresolved: boolean;
  readonly onOnlyUnresolved: (only: boolean) => void;
  readonly trigger: TriggerContext;
  readonly onTrigger: (trigger: TriggerContext) => void;
  /** The spells and champions that the conditions name, which the trigger pickers list. */
  readonly choices: { readonly spells: readonly string[]; readonly targets: readonly string[] };
  /** `mObjectPath`, which ends the first row, or null if the object does not write it. */
  readonly path: string | null;
  /** The menu bar of the view, which leads the first row. */
  readonly menubar: ReactNode;
}

/**
 * The toolbar of the Voice lines view, in two rows.
 *
 * The first row holds the menu bar, the filter, the unresolved count and the object's path. The
 * second holds the
 * skin the names resolve as with its tags and the Inferred chip, the shared cooldown, and the
 * trigger that a situation's play simulates. "Inferred" is drawn here once, not on each line. Per
 * "Header" in docs/ux/CONTEXTUAL_VOICE.md.
 */
export function VoiceLinesHeader({
  data,
  onSkin,
  onCooldown,
  filter,
  onFilter,
  unresolved,
  onlyUnresolved,
  onOnlyUnresolved,
  trigger,
  onTrigger,
  choices,
  path,
  menubar,
}: VoiceLinesHeaderProps) {
  const skin = data.skins.find((each) => each.bin === data.skin) ?? null;
  const pick = (value: string | null) => (value === null || value === ANY ? null : value);

  return (
    <div data-ui="VoiceLinesHeader" className="flex flex-col border-b border-surface-700/50">
      <div className="flex min-w-0 items-center gap-2 border-b border-surface-700/40 py-1 pr-2 pl-1 select-none">
        <ShellHeaderPortal slot="menubar" fallback={menubar}>
          {menubar}
        </ShellHeaderPortal>
        <span className="flex w-56 min-w-32 shrink items-center">
          <SearchField
            value={filter}
            onChange={onFilter}
            label={m.audio_voice_filter_label()}
            clearLabel={m.audio_filter_clear_label()}
          />
        </span>
        {unresolved > 0 && (
          <TogglePill
            size="xs"
            label={m.audio_voice_unresolved_label({ count: unresolved })}
            active={onlyUnresolved}
            onClick={() => onOnlyUnresolved(!onlyUnresolved)}
          />
        )}
        <span className="ml-auto flex min-w-0 items-center gap-2">
          {data.skins.length > 1 && <SharedMark count={data.skins.length} />}
          {path !== null && (
            <Code className="min-w-0 truncate text-surface-400 select-text">{path}</Code>
          )}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 px-2 py-1.5 select-none">
        <SkinPicker data={data} skin={skin} onSkin={onSkin} />
        <span className="h-4 w-px shrink-0 bg-surface-700" aria-hidden />
        <span className="flex shrink-0 items-center gap-1.5">
          <span className={LABEL_CLASSES}>{m.audio_voice_field_shared_cooldown_label()}</span>
          <TextControl
            kind="number"
            label={m.audio_voice_field_shared_cooldown_label()}
            value={data.lines.cooldown ?? 0}
            onEdit={onCooldown === null ? null : (value) => onCooldown(Number(value ?? 0))}
          />
          <span className={LABEL_CLASSES}>{m.audio_edit_unit_seconds()}</span>
        </span>
        <span className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
          <Tooltip content={m.audio_voice_simulate_hint()}>
            <span className={LABEL_CLASSES}>{m.audio_voice_simulate_label()}</span>
          </Tooltip>
          <Select.Root
            value={trigger.audience}
            onValueChange={(value) => {
              const audience = AUDIENCES.find((each) => each === value);
              if (audience !== undefined) onTrigger({ ...trigger, audience });
            }}
          >
            <Select.Trigger aria-label={m.audio_voice_audience_label()} size="sm" className="w-28">
              <Select.Value>{(value: Audience) => audienceLabel(value)}</Select.Value>
              <Select.Icon />
            </Select.Trigger>
            <Select.Content>
              {AUDIENCES.map((audience) => (
                <Select.Item key={audience} value={audience}>
                  {audienceLabel(audience)}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
          <TriggerPicker
            label={m.audio_voice_trigger_target_label()}
            value={trigger.target}
            options={choices.targets}
            onChange={(value) => onTrigger({ ...trigger, target: pick(value) })}
          />
          <TriggerPicker
            label={m.audio_voice_trigger_spell_label()}
            value={trigger.spell}
            options={choices.spells}
            onChange={(value) => onTrigger({ ...trigger, spell: pick(value) })}
          />
        </span>
      </div>
    </div>
  );
}

interface SkinPickerProps {
  readonly data: VoiceLinesResponse;
  readonly skin: VoiceSkin | null;
  readonly onSkin: (bin: string) => void;
}

/** The skin that the names resolve as, its tags, and the one Inferred chip. */
function SkinPicker({ data, skin, onSkin }: SkinPickerProps) {
  if (data.skins.length === 0) {
    return (
      <span className="flex items-center gap-1 text-meta text-warning-text">
        <WarningIcon weight="fill" className="size-3.5" aria-hidden />
        {m.audio_voice_no_skin_label()}
      </span>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className={LABEL_CLASSES}>{m.audio_voice_resolve_as_label()}</span>
      <Select.Root value={data.skin} onValueChange={(bin) => bin !== null && onSkin(bin)}>
        <Select.Trigger aria-label={m.audio_voice_skin_picker_label()} size="sm" className="w-32">
          <Select.Value>
            {(bin: string | null) => (bin === null ? "" : skinLabel(bin))}
          </Select.Value>
          <Select.Icon />
        </Select.Trigger>
        <Select.Content>
          {data.skins.map((each) => (
            <Select.Item key={`${each.bin}:${each.row.objectHash}`} value={each.bin}>
              {skinLabel(each.bin)}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
      {skin !== null && skin.tags.length > 0 && (
        <Inline gap={1}>
          {skin.tags.map((tag) => (
            <Code key={tag} className="select-text">
              {tag}
            </Code>
          ))}
        </Inline>
      )}
      <Tooltip content={m.audio_voice_inferred_hint()}>
        <Badge dashed>{m.audio_voice_inferred_label()}</Badge>
      </Tooltip>
    </span>
  );
}

interface TriggerPickerProps {
  readonly label: string;
  readonly value: string | null;
  readonly options: readonly string[];
  readonly onChange: (value: string | null) => void;
}

/** A labelled choice of the trigger: Any, or one name the conditions test. */
function TriggerPicker({ label, value, options, onChange }: TriggerPickerProps) {
  if (options.length === 0) return null;

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span className={LABEL_CLASSES}>{label}</span>
      <Select.Root value={value ?? ANY} onValueChange={onChange}>
        <Select.Trigger aria-label={label} size="sm" className="w-36">
          <Select.Value>
            {(current: string | null) =>
              current === null || current === ANY ? m.audio_voice_trigger_any_label() : current
            }
          </Select.Value>
          <Select.Icon />
        </Select.Trigger>
        <Select.Content>
          <Select.Item value={ANY}>{m.audio_voice_trigger_any_label()}</Select.Item>
          {options.map((option) => (
            <Select.Item key={option} value={option}>
              {option}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </span>
  );
}

/** The mark of an object that several skins link, whose hover states what an edit changes. */
function SharedMark({ count }: { count: number }) {
  return (
    <Tooltip content={m.audio_voice_shared_notice({ count })}>
      <Badge tone="warning" icon={<WarningIcon weight="fill" className="size-2.5" />}>
        {m.audio_voice_shared_label({ count })}
      </Badge>
    </Tooltip>
  );
}

import { CopySimpleIcon, SidebarSimpleIcon, WarningIcon } from "@phosphor-icons/react";

import {
  AlertBox,
  Badge,
  Button,
  IconButton,
  SearchField,
  Select,
  TogglePill,
  Tooltip,
} from "@/components";
import { m } from "@/i18n";
import type { Audience, VoiceLinesResponse, VoiceSkin } from "@/lib/tauri";

import { skinLabel } from "../utils/voiceLines";
import type { TriggerContext } from "../utils/voiceTrigger";
import { TextControl } from "./VoiceFieldRows";
import { audienceLabel } from "./VoiceLineRows";

/** The value of a trigger picker that tests no champion or spell. */
const ANY = "";

const AUDIENCES: readonly Audience[] = ["owner", "ally", "enemy", "spectator"];

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
  readonly inspecting: boolean;
  readonly onInspecting: (open: boolean) => void;
}

/**
 * The toolbar of the Voice lines view: the skin the names resolve as with its tags, the shared
 * cooldown, the Inferred chip, the filter, and the trigger a situation's play simulates.
 *
 * "Inferred" is drawn here once, not on each line. Per "Header" in docs/ux/CONTEXTUAL_VOICE.md.
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
  inspecting,
  onInspecting,
}: VoiceLinesHeaderProps) {
  const skin = data.skins.find((each) => each.bin === data.skin) ?? null;
  const pick = (value: string | null) => (value === null || value === ANY ? null : value);

  return (
    <div
      data-ui="VoiceLinesHeader"
      className="flex flex-col gap-1 border-b border-surface-700/50 px-2 py-1.5 select-none"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {data.skins.length > 0 && (
          <Select.Root value={data.skin} onValueChange={(bin) => bin !== null && onSkin(bin)}>
            <Select.Trigger
              aria-label={m.audio_voice_skin_picker_label()}
              size="sm"
              className="w-44"
            />
            <Select.Content>
              {data.skins.map((each) => (
                <Select.Item key={`${each.bin}:${each.row.objectHash}`} value={each.bin}>
                  {skinLabel(each.bin)}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        )}
        {data.skins.length === 0 && (
          <span className="flex items-center gap-1 text-meta text-warning-text">
            <WarningIcon weight="fill" className="size-3.5" aria-hidden />
            {m.audio_voice_no_skin_label()}
          </span>
        )}
        {skin !== null && skin.tags.length > 0 && (
          <span className="shrink-0 text-meta text-surface-400 select-text">
            {m.audio_voice_tags_label({ tags: skin.tags.join(", ") })}
          </span>
        )}
        <span className="flex shrink-0 items-center gap-1 text-meta text-surface-400">
          {m.audio_voice_field_shared_cooldown_label()}
          <TextControl
            kind="number"
            label={m.audio_voice_field_shared_cooldown_label()}
            value={data.lines.cooldown ?? 0}
            onEdit={onCooldown === null ? null : (value) => onCooldown(Number(value ?? 0))}
          />
          {m.audio_edit_unit_seconds()}
        </span>
        <Tooltip content={m.audio_voice_inferred_hint()}>
          <Badge size="sm" dashed>
            {m.audio_voice_inferred_label()}
          </Badge>
        </Tooltip>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {unresolved > 0 && (
            <TogglePill
              size="xs"
              label={m.audio_voice_unresolved_label({ count: unresolved })}
              active={onlyUnresolved}
              onClick={() => onOnlyUnresolved(!onlyUnresolved)}
            />
          )}
          <IconButton
            icon={<SidebarSimpleIcon weight="bold" mirrored />}
            label={m.audio_inspector_toggle_action()}
            tooltip={m.audio_inspector_toggle_action()}
            pressed={inspecting}
            onClick={() => onInspecting(!inspecting)}
          />
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="w-56">
          <SearchField
            value={filter}
            onChange={onFilter}
            label={m.audio_voice_filter_label()}
            clearLabel={m.audio_filter_clear_label()}
          />
        </span>
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
        <Select.Root
          value={trigger.audience}
          onValueChange={(value) => {
            const audience = AUDIENCES.find((each) => each === value);
            if (audience !== undefined) onTrigger({ ...trigger, audience });
          }}
        >
          <Select.Trigger aria-label={m.audio_voice_audience_label()} size="sm" className="w-32" />
          <Select.Content>
            {AUDIENCES.map((audience) => (
              <Select.Item key={audience} value={audience}>
                {audienceLabel(audience)}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </div>
    </div>
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
    <span className="flex shrink-0 items-center gap-1.5 text-meta text-surface-400">
      {label}
      <Select.Root value={value ?? ANY} onValueChange={onChange}>
        <Select.Trigger aria-label={label} size="sm" className="w-40" />
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

interface SharedNoticeProps {
  readonly count: number;
  readonly skin: VoiceSkin | null;
  readonly onCopy: (skin: VoiceSkin) => void;
  readonly onDismiss: () => void;
}

/** The notice of an object that several skins link, with the copy for the chosen skin. */
export function SharedNotice({ count, skin, onCopy, onDismiss }: SharedNoticeProps) {
  return (
    <div data-ui="VoiceLinesHeader:shared" className="shrink-0 px-2 pt-1.5">
      <AlertBox
        tone="warning"
        onDismiss={onDismiss}
        actions={
          skin !== null && (
            <Button
              variant="outline"
              size="xs"
              left={<CopySimpleIcon weight="bold" />}
              onClick={() => onCopy(skin)}
            >
              {m.audio_voice_copy_for_skin_action()}
            </Button>
          )
        }
      >
        {m.audio_voice_shared_notice({ count })}
      </AlertBox>
    </div>
  );
}

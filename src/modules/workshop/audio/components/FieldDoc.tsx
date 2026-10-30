import { Code, HoverCard, Properties, Property } from "@/components";
import { m, Marked } from "@/i18n";
import { twMerge } from "@/utils";

import { CARD_TEXT } from "../../bin/classes/components/ClassCard";
import type { FieldSection, FieldTopic } from "../utils/fieldTopics";

/** The copy of one topic: its name, what it does, its values, its default and its Wwise name. */
interface TopicCopy {
  readonly label: () => string;
  readonly description: () => string;
  readonly values: () => string;
  /** Null for a field without a default, such as an ID. */
  readonly fallback: (() => string) | null;
  /** The Wwise property or field, with a property name marked as `*Volume*`. */
  readonly wwise: () => string;
}

const TOPIC_COPY: Record<FieldTopic, TopicCopy> = {
  target: {
    label: m.audio_field_target_label,
    description: m.audio_field_target_description,
    values: m.audio_field_target_values_hint,
    fallback: null,
    wwise: m.audio_field_target_wwise_hint,
  },
  source: {
    label: m.audio_field_source_label,
    description: m.audio_field_source_description,
    values: m.audio_field_source_values_hint,
    fallback: null,
    wwise: m.audio_field_source_wwise_hint,
  },
  volume: {
    label: m.audio_field_volume_label,
    description: m.audio_field_volume_description,
    values: m.audio_field_volume_values_hint,
    fallback: m.audio_field_volume_default_hint,
    wwise: m.audio_field_volume_wwise_hint,
  },
  makeUpGain: {
    label: m.audio_field_make_up_gain_label,
    description: m.audio_field_make_up_gain_description,
    values: m.audio_field_make_up_gain_values_hint,
    fallback: m.audio_field_make_up_gain_default_hint,
    wwise: m.audio_field_make_up_gain_wwise_hint,
  },
  pitch: {
    label: m.audio_field_pitch_label,
    description: m.audio_field_pitch_description,
    values: m.audio_field_pitch_values_hint,
    fallback: m.audio_field_pitch_default_hint,
    wwise: m.audio_field_pitch_wwise_hint,
  },
  lpf: {
    label: m.audio_field_lpf_label,
    description: m.audio_field_lpf_description,
    values: m.audio_field_lpf_values_hint,
    fallback: m.audio_field_lpf_default_hint,
    wwise: m.audio_field_lpf_wwise_hint,
  },
  hpf: {
    label: m.audio_field_hpf_label,
    description: m.audio_field_hpf_description,
    values: m.audio_field_hpf_values_hint,
    fallback: m.audio_field_hpf_default_hint,
    wwise: m.audio_field_hpf_wwise_hint,
  },
  initialDelay: {
    label: m.audio_field_initial_delay_label,
    description: m.audio_field_initial_delay_description,
    values: m.audio_field_initial_delay_values_hint,
    fallback: m.audio_field_initial_delay_default_hint,
    wwise: m.audio_field_initial_delay_wwise_hint,
  },
  actionDelay: {
    label: m.audio_field_action_delay_label,
    description: m.audio_field_action_delay_description,
    values: m.audio_field_action_delay_values_hint,
    fallback: m.audio_field_action_delay_default_hint,
    wwise: m.audio_field_action_delay_wwise_hint,
  },
  loopCount: {
    label: m.audio_field_loop_count_label,
    description: m.audio_field_loop_count_description,
    values: m.audio_field_loop_count_values_hint,
    fallback: m.audio_field_loop_count_default_hint,
    wwise: m.audio_field_loop_count_wwise_hint,
  },
  weight: {
    label: m.audio_field_weight_label,
    description: m.audio_field_weight_description,
    values: m.audio_field_weight_values_hint,
    fallback: m.audio_field_weight_default_hint,
    wwise: m.audio_field_weight_wwise_hint,
  },
  playlist: {
    label: m.audio_field_playlist_mode_label,
    description: m.audio_field_playlist_mode_description,
    values: m.audio_field_playlist_mode_values_hint,
    fallback: null,
    wwise: m.audio_field_playlist_mode_wwise_hint,
  },
  pick: {
    label: m.audio_field_weight_mode_label,
    description: m.audio_field_weight_mode_description,
    values: m.audio_field_weight_mode_values_hint,
    fallback: null,
    wwise: m.audio_field_weight_mode_wwise_hint,
  },
  switchGroup: {
    label: m.audio_field_switch_group_label,
    description: m.audio_field_switch_group_description,
    values: m.audio_field_switch_group_values_hint,
    fallback: null,
    wwise: m.audio_field_switch_group_wwise_hint,
  },
  defaultSwitch: {
    label: m.audio_field_default_switch_label,
    description: m.audio_field_default_switch_description,
    values: m.audio_field_default_switch_values_hint,
    fallback: null,
    wwise: m.audio_field_default_switch_wwise_hint,
  },
};

/** The header of each inspector section. */
export const SECTION_TITLE: Record<FieldSection, () => string> = {
  media: m.audio_inspector_section_media_label,
  mix: m.audio_inspector_section_mix_label,
  filters: m.audio_inspector_section_filters_label,
  timing: m.audio_inspector_section_timing_label,
  selection: m.audio_inspector_section_selection_label,
};

/** Returns the name that a row gives `topic`. */
export function topicLabel(topic: FieldTopic): string {
  return TOPIC_COPY[topic].label();
}

interface FieldDocNameProps {
  readonly topic: FieldTopic;
  readonly className?: string;
}

/**
 * A field's name, and the field card that documents it while the pointer is on it.
 *
 * The card follows the bin editor's field card: the name, what the field does in the game, its
 * values and default, and the Wwise property that holds it.
 */
export function FieldDocName({ topic, className }: FieldDocNameProps) {
  const label = topicLabel(topic);

  return (
    <HoverCard
      label={label}
      className={twMerge("w-max max-w-sm min-w-64", CARD_TEXT)}
      content={<FieldDocBody topic={topic} />}
    >
      <span
        className={twMerge(
          "min-w-0 truncate decoration-dotted underline-offset-2 hover:underline",
          className,
        )}
      >
        {label}
      </span>
    </HoverCard>
  );
}

function FieldDocBody({ topic }: { topic: FieldTopic }) {
  const copy = TOPIC_COPY[topic];

  return (
    <div data-ui="FieldDoc" className="flex flex-col gap-2.5">
      <header className="flex flex-col gap-1">
        <span className="font-medium text-surface-50">{copy.label()}</span>
        <p className="text-surface-300">{copy.description()}</p>
      </header>
      <Properties className="gap-y-1.5">
        <Property label={m.audio_field_values_label()}>{copy.values()}</Property>
        {copy.fallback !== null && (
          <Property label={m.audio_field_default_label()}>{copy.fallback()}</Property>
        )}
        <Property label={m.audio_field_wwise_label()}>
          {/* DS-CODE-CHIP */}
          <Marked text={copy.wwise()}>
            {(name) => <Code className="select-text">{name}</Code>}
          </Marked>
        </Property>
      </Properties>
    </div>
  );
}

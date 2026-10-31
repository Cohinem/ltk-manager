//! The voice lines of one `ContextualActionData` object: its situations, rules and conditions,
//! with each short name resolved through the tags of one skin to an event of that skin's
//! voice-over banks.
//!
//! "Voice lines" in `docs/ux/CONTEXTUAL_VOICE.md`. Every path is a hash path (ADR-0027) relative
//! to the object's `mSituations` field, the holder that an edit of the view addresses.

use std::collections::HashMap;

use ltk_hash::BinHash;
use ltk_manager_assets::preview::AssetRef;
use ltk_manager_base::hashing::named;
use ltk_meta::property::values;
use ltk_meta::{BinObject, PropertyValueEnum};
use ltk_wwise::ObjectId;
use ltk_wwise::hierarchy::ObjectKind;
use serde::Serialize;

use crate::bank_set::{
    BankContent, BankSet, BankUnit, CONDITION_SPELL, CONDITION_SPELL_NAME, RULE_AUDIO_ACTION,
    RULE_CONDITIONS, RULE_NAME,
};
use crate::bin_audio::{Audience, SiteStep, hash_path};
use crate::contextual::{compose_vo_names, spell_segment};
use crate::index::AudioIndex;
use crate::references::{SiteNames, SiteRow, site_row};

/// The field hash of `mSituations` on `ContextualActionData`, the holder of every edit.
pub const SITUATIONS: BinHash = named("mSituations");

const COOLDOWN: BinHash = named("mCooldown");
const HEALTH_THRESHOLD: BinHash = named("mHealthPercentThreshold");
const RULES: BinHash = named("mRules");
const CHOOSE_RANDOM: BinHash = named("mChooseRandomValidRule");
const SITUATION_COOLDOWN: BinHash = named("mCoolDownTime");
const RELATIONSHIP: BinHash = named("mConditionRelationship");
const PRIORITY: BinHash = named("mPriority");
const STOMP_LOWER: BinHash = named("StompLowerPriority");
const CAN_STOMP_SELF: BinHash = named("CanStompSelf");
const ACTIVE_VOICE_OVER: BinHash = named("ActiveVoiceOver");
const OVERRIDE_COOLDOWN: BinHash = named("mOverrideCacCooldown");
const COOLDOWN_MODIFICATIONS: BinHash = named("CooldownModifications");
const IGNORE_TIMER: BinHash = named("IgnoreTimer");
const DONT_RESET_TIMER: BinHash = named("DontResetTimer");
const CHANCE_WEIGHT: BinHash = named("ChanceWeight");
const ANIMATION_ACTION: BinHash = named("mAnimationAction");
const ANIMATION_NAME: BinHash = named("mHashedAnimationName");
const TRIGGER_ACTION: BinHash = named("mTriggerEventAction");
const SITUATION_TRIGGER: BinHash = named("mHashedSituationTrigger");
const MAX_OCCURRENCES: BinHash = named("mMaxOccurences");
const WAIT_FOR_ANNOUNCER: BinHash = named("mWaitForAnnouncerQueue");
const WAIT_TIMEOUT: BinHash = named("mWaitTimeout");

/// The fields of `ContextualActionPlayAudio` that contain a short event name, by audience.
const AUDIENCE_FIELDS: [(Audience, BinHash); 4] = [
    (Audience::Owner, named("mSelfEventName")),
    (Audience::Ally, named("mAllyEventName")),
    (Audience::Enemy, named("mEnemyEventName")),
    (Audience::Spectator, named("mSpectatorEventName")),
];

/// The situations of one `ContextualActionData` object, in map order.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct VoiceLines {
    /// `mCooldown`, the shared cooldown of every situation in seconds.
    pub cooldown: f32,
    /// `mHealthPercentThreshold`, or `None` if the object does not write it.
    pub health_threshold: Option<f32>,
    pub situations: Vec<VoiceSituation>,
}

/// One entry of `mSituations`: the rules of one situation key.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct VoiceSituation {
    /// The key, the hash of the lowercased situation name.
    pub key: u32,
    /// The situation name, or `None` if no table names the key.
    pub name: Option<String>,
    /// The hash path of the entry, such as `{5ca57000}`.
    pub path: String,
    /// `mChooseRandomValidRule`.
    pub choose_random: bool,
    /// `mCoolDownTime` in seconds.
    pub cooldown: f32,
    pub rules: Vec<VoiceRule>,
}

/// One `ContextualRule`, with every field at its value or its default.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct VoiceRule {
    /// The hash path of the rule, such as `{5ca57000}.1a116faf[0]`.
    pub path: String,
    /// `mRuleName`, or `None` if the rule does not write one.
    pub name: Option<String>,
    /// `mConditionRelationship`: `0` passes when every condition passes, any other value when one
    /// condition passes.
    pub relationship: u32,
    /// `mPriority`, or `None` while the option is unset.
    pub priority: Option<i32>,
    /// `StompLowerPriority`.
    pub stomp_lower: bool,
    /// `CanStompSelf`.
    pub can_stomp_self: bool,
    /// `ActiveVoiceOver`.
    pub active_voice_over: bool,
    /// `mOverrideCacCooldown`.
    pub override_cooldown: bool,
    /// The fields of `CooldownModifications`, or `None` while the pointer is null.
    pub cooldown_modifications: Option<CooldownModifications>,
    /// `ChanceWeight`.
    pub chance_weight: f32,
    /// `mConditions`, in list order.
    pub conditions: Vec<VoiceCondition>,
    /// `mAudioAction`, or `None` while the pointer is null.
    pub audio: Option<AudioAction>,
    /// `mAnimationAction.mHashedAnimationName`, or `None` without an animation action.
    pub animation: Option<HashText>,
    /// `mTriggerEventAction.mHashedSituationTrigger`, or `None` without a trigger action.
    pub trigger: Option<HashText>,
}

/// The fields of `ContextualActionCooldownModifications`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CooldownModifications {
    pub ignore_timer: bool,
    pub dont_reset_timer: bool,
}

/// A hash value and the name a table gives it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct HashText {
    pub hash: u32,
    pub name: Option<String>,
}

/// The audio action of a rule.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct AudioAction {
    /// The class hash, `ContextualActionPlayVO` in every shipped rule.
    pub class: u32,
    /// `mMaxOccurences`, the plays per unit per game. `0` is no limit.
    pub max_occurrences: u32,
    /// `mWaitForAnnouncerQueue`.
    pub wait_for_announcer: bool,
    /// `mWaitTimeout` in seconds.
    pub wait_timeout: f32,
    /// One line per audience, in field order, empty names included.
    pub lines: Vec<AudienceLine>,
}

/// The short name of one audience, and the event it resolves to for the chosen skin.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct AudienceLine {
    pub audience: Audience,
    /// The `m*EventName` string. Empty if the action does not write it.
    pub short: String,
    /// The first composed name that an event of the skin's banks hashes to.
    pub event: Option<ResolvedEvent>,
    /// The composed names, in [`compose_vo_names`] order. Empty for an empty short name.
    pub candidates: Vec<String>,
}

/// An event of a skin's voice-over bank set.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ResolvedEvent {
    /// The object ID of the event.
    pub id: u32,
    /// The composed name that hashes to the ID.
    pub name: String,
    /// The game path of the bank that contains the event.
    pub bank: String,
    /// The layer file or game chunk of that bank.
    pub asset: Option<AssetRef>,
}

/// One condition, or one struct under a condition, with every field it writes.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct VoiceCondition {
    /// The class hash.
    pub class: u32,
    /// The class name, or `None` if no table names the class.
    pub class_name: Option<String>,
    /// The hash path of the value, such as `{5ca57000}.1a116faf[0].2aff6c4a[1]`.
    pub path: String,
    /// The fields the value writes, in file order.
    pub fields: Vec<VoiceConditionField>,
}

/// One field of a [`VoiceCondition`].
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct VoiceConditionField {
    /// The field hash.
    pub field: u32,
    /// The field name, or `None` if no table names the field.
    pub name: Option<String>,
    pub value: VoiceConditionValue,
}

/// The value of a [`VoiceConditionField`].
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum VoiceConditionValue {
    Bool {
        value: bool,
    },
    /// Any integer kind. Every shipped integer fits an `f64` exactly.
    Integer {
        value: f64,
    },
    Float {
        value: f32,
    },
    Text {
        value: String,
    },
    Hash {
        hash: HashText,
    },
    /// A list, an unordered list or a set option.
    List {
        items: Vec<VoiceConditionValue>,
    },
    /// A pointer or an embed. `None` for a null pointer.
    Object {
        condition: Option<Box<VoiceCondition>>,
    },
    /// A kind that the view draws by its name alone, such as a vector.
    Other {
        /// The kind of the value, as `ltk_meta` names it.
        shape: String,
    },
}

/// The voice-over bank set of one skin, and the tags that compose its event names.
#[derive(Debug)]
pub struct SkinVoice<'a> {
    /// `skinAudioProperties.tagEventList`.
    pub tags: &'a [String],
    /// The files of the skin's voice-over bank units.
    pub banks: &'a BankSet,
}

impl VoiceLines {
    /// Reads the voice lines of the `ContextualActionData` object `object`.
    ///
    /// Each short name composes its event names with the tags of `skin`, and resolves to the
    /// first name whose ID is an event of an event bank of the skin's set. Without a skin, every
    /// line is unresolved and has no candidate. `names` names the situation keys and the
    /// hashes of spell, character and animation fields. A field of an unexpected kind reads as
    /// its default.
    #[must_use]
    pub fn read(object: &BinObject, skin: Option<&SkinVoice<'_>>, names: &dyn SiteNames) -> Self {
        let events = skin.map(|skin| bank_events(skin.banks)).unwrap_or_default();
        let reader = Reader {
            skin,
            events: &events,
            names,
        };
        let properties = &object.properties;

        let situations = match properties.get(&SITUATIONS) {
            Some(PropertyValueEnum::Map(map)) => map
                .entries()
                .iter()
                .filter_map(|(key, value)| reader.situation(key, value))
                .collect(),
            _ => Vec::new(),
        };

        Self {
            cooldown: float_or(properties.get(&COOLDOWN), 0.0),
            health_threshold: properties.get(&HEALTH_THRESHOLD).and_then(float),
            situations,
        }
    }
}

/// The reads that resolve the short names of one object.
struct Reader<'a> {
    skin: Option<&'a SkinVoice<'a>>,
    events: &'a HashMap<ObjectId, usize>,
    names: &'a dyn SiteNames,
}

impl Reader<'_> {
    fn situation(
        &self,
        key: &PropertyValueEnum,
        value: &PropertyValueEnum,
    ) -> Option<VoiceSituation> {
        let key = hash(key)?;
        let inner = struct_of(value)?;
        let path = hash_path(&[SiteStep::Key(format!("{key:08x}"))]);

        let rules = match inner.properties.get(&RULES) {
            Some(value) => items(value)
                .iter()
                .enumerate()
                .filter_map(|(index, rule)| {
                    let steps = [SiteStep::Field(RULES.0), SiteStep::Index(index)];
                    self.rule(&join(&path, &steps), struct_of(rule)?)
                })
                .collect(),
            None => Vec::new(),
        };

        Some(VoiceSituation {
            key,
            name: self.names.hash_name(key),
            choose_random: bool_or(inner.properties.get(&CHOOSE_RANDOM), false),
            cooldown: float_or(inner.properties.get(&SITUATION_COOLDOWN), 0.0),
            path,
            rules,
        })
    }

    fn rule(&self, path: &str, rule: &values::Struct) -> Option<VoiceRule> {
        let fields = &rule.properties;

        let conditions: Vec<VoiceCondition> = match fields.get(&RULE_CONDITIONS) {
            Some(value) => items(value)
                .iter()
                .enumerate()
                .filter_map(|(index, item)| {
                    let steps = [SiteStep::Field(RULE_CONDITIONS.0), SiteStep::Index(index)];
                    self.condition(&join(path, &steps), struct_of(item)?)
                })
                .collect(),
            None => Vec::new(),
        };
        let spells: Vec<String> = conditions
            .iter()
            .filter(|condition| condition.class == CONDITION_SPELL_NAME.0)
            .filter_map(|condition| match field_value(condition, CONDITION_SPELL) {
                Some(VoiceConditionValue::Hash { hash }) => hash.name.clone(),
                _ => None,
            })
            .map(|path| spell_segment(&path).to_owned())
            .collect();

        let cooldown_modifications =
            fields
                .get(&COOLDOWN_MODIFICATIONS)
                .and_then(struct_of)
                .map(|inner| CooldownModifications {
                    ignore_timer: bool_or(inner.properties.get(&IGNORE_TIMER), false),
                    dont_reset_timer: bool_or(inner.properties.get(&DONT_RESET_TIMER), false),
                });

        Some(VoiceRule {
            path: path.to_owned(),
            name: fields
                .get(&RULE_NAME)
                .and_then(text)
                .filter(|name| !name.is_empty())
                .map(str::to_owned),
            relationship: integer(fields.get(&RELATIONSHIP))
                .and_then(|value| u32::try_from(value).ok())
                .unwrap_or(0),
            priority: fields
                .get(&PRIORITY)
                .and_then(|value| match value {
                    PropertyValueEnum::Optional(option) => option.value(),
                    value => Some(value),
                })
                .and_then(|value| integer(Some(value)))
                .and_then(|value| i32::try_from(value).ok()),
            stomp_lower: bool_or(fields.get(&STOMP_LOWER), true),
            can_stomp_self: bool_or(fields.get(&CAN_STOMP_SELF), false),
            active_voice_over: bool_or(fields.get(&ACTIVE_VOICE_OVER), true),
            override_cooldown: bool_or(fields.get(&OVERRIDE_COOLDOWN), false),
            cooldown_modifications,
            chance_weight: float_or(fields.get(&CHANCE_WEIGHT), 1.0),
            audio: fields
                .get(&RULE_AUDIO_ACTION)
                .and_then(struct_of)
                .map(|action| self.audio(action, &spells)),
            animation: self.hash_field(fields.get(&ANIMATION_ACTION), ANIMATION_NAME),
            trigger: self.hash_field(fields.get(&TRIGGER_ACTION), SITUATION_TRIGGER),
            conditions,
        })
    }

    fn audio(&self, action: &values::Struct, spells: &[String]) -> AudioAction {
        let fields = &action.properties;
        let lines = AUDIENCE_FIELDS
            .iter()
            .map(|&(audience, field)| {
                let short = fields.get(&field).and_then(text).unwrap_or_default();
                self.line(audience, short, spells)
            })
            .collect();

        AudioAction {
            class: action.class_hash.0,
            max_occurrences: integer(fields.get(&MAX_OCCURRENCES))
                .and_then(|value| u32::try_from(value).ok())
                .unwrap_or(0),
            wait_for_announcer: bool_or(fields.get(&WAIT_FOR_ANNOUNCER), false),
            wait_timeout: float_or(fields.get(&WAIT_TIMEOUT), 0.0),
            lines,
        }
    }

    fn line(&self, audience: Audience, short: &str, spells: &[String]) -> AudienceLine {
        let candidates = match self.skin {
            Some(skin) if !short.is_empty() => compose_vo_names(skin.tags, spells, short),
            _ => Vec::new(),
        };
        let event = self.skin.and_then(|skin| {
            candidates.iter().find_map(|name| {
                let id = ObjectId::from_name(name);
                let file = &skin.banks.files()[*self.events.get(&id)?];
                Some(ResolvedEvent {
                    id: id.0,
                    name: name.clone(),
                    bank: file.path().to_owned(),
                    asset: file.asset().cloned(),
                })
            })
        });

        AudienceLine {
            audience,
            short: short.to_owned(),
            event,
            candidates,
        }
    }

    fn condition(&self, path: &str, value: &values::Struct) -> Option<VoiceCondition> {
        let fields = value
            .properties
            .iter()
            .map(|(field, value)| {
                let path = join(path, &[SiteStep::Field(field.0)]);
                VoiceConditionField {
                    field: field.0,
                    name: self.names.field_name(field.0),
                    value: self.value(&path, value),
                }
            })
            .collect();

        Some(VoiceCondition {
            class: value.class_hash.0,
            class_name: self.names.class_name(value.class_hash.0),
            path: path.to_owned(),
            fields,
        })
    }

    fn value(&self, path: &str, value: &PropertyValueEnum) -> VoiceConditionValue {
        if let Some(value) = boolean(value) {
            return VoiceConditionValue::Bool { value };
        }
        if let Some(value) = integer(Some(value)) {
            #[expect(
                clippy::cast_precision_loss,
                reason = "every shipped condition integer is under 2^53"
            )]
            return VoiceConditionValue::Integer {
                value: value as f64,
            };
        }

        match value {
            PropertyValueEnum::F32(number) => VoiceConditionValue::Float {
                value: number.value,
            },
            PropertyValueEnum::String(string) => VoiceConditionValue::Text {
                value: string.value.clone(),
            },
            PropertyValueEnum::Hash(_) | PropertyValueEnum::ObjectLink(_) => {
                let hash_value = hash(value).unwrap_or(0);
                VoiceConditionValue::Hash {
                    hash: HashText {
                        hash: hash_value,
                        name: self.names.hash_name(hash_value),
                    },
                }
            }
            PropertyValueEnum::Container(_)
            | PropertyValueEnum::UnorderedContainer(_)
            | PropertyValueEnum::Optional(_) => VoiceConditionValue::List {
                items: items(value)
                    .iter()
                    .enumerate()
                    .map(|(index, item)| self.value(&join(path, &[SiteStep::Index(index)]), item))
                    .collect(),
            },
            PropertyValueEnum::Struct(_) | PropertyValueEnum::Embedded(_) => {
                VoiceConditionValue::Object {
                    condition: struct_of(value)
                        .and_then(|inner| self.condition(path, inner))
                        .map(Box::new),
                }
            }
            other => VoiceConditionValue::Other {
                shape: format!("{:?}", other.kind()),
            },
        }
    }

    fn hash_field(&self, action: Option<&PropertyValueEnum>, field: BinHash) -> Option<HashText> {
        let action = struct_of(action?)?;
        let value = hash(action.properties.get(&field)?)?;
        Some(HashText {
            hash: value,
            name: self.names.hash_name(value),
        })
    }
}

/// Returns the value of `field` of `condition`, if it writes the field.
fn field_value(condition: &VoiceCondition, field: BinHash) -> Option<&VoiceConditionValue> {
    condition
        .fields
        .iter()
        .find(|each| each.field == field.0)
        .map(|each| &each.value)
}

/// Returns `path` with the steps `steps` after it.
fn join(path: &str, steps: &[SiteStep]) -> String {
    let tail = hash_path(steps);
    if path.is_empty() {
        return tail;
    }
    if tail.starts_with(['[', '{']) {
        return format!("{path}{tail}");
    }
    format!("{path}.{tail}")
}

/// Returns the index of the first file of `set` that contains each event, by event ID.
fn bank_events(set: &BankSet) -> HashMap<ObjectId, usize> {
    let mut events = HashMap::new();
    for (at, file) in set.files().iter().enumerate() {
        let BankContent::Bank { bank } = file.content() else {
            continue;
        };
        let Some(hierarchy) = bank.hierarchy() else {
            continue;
        };
        for object in hierarchy.of_kind(ObjectKind::EVENT) {
            events.entry(object.id()).or_insert(at);
        }
    }
    events
}

/// Returns the inner struct of a pointer or an embed, or `None` for a null pointer.
fn struct_of(value: &PropertyValueEnum) -> Option<&values::Struct> {
    let inner = match value {
        PropertyValueEnum::Struct(inner) | PropertyValueEnum::Embedded(values::Embedded(inner)) => {
            inner
        }
        _ => return None,
    };
    (inner.class_hash.0 != 0).then_some(inner)
}

/// Returns the items of a list, an unordered list or an option. Any other value has none.
fn items(value: &PropertyValueEnum) -> &[PropertyValueEnum] {
    match value {
        PropertyValueEnum::Container(list)
        | PropertyValueEnum::UnorderedContainer(values::UnorderedContainer(list)) => list.items(),
        PropertyValueEnum::Optional(option) => {
            option.value().map(std::slice::from_ref).unwrap_or_default()
        }
        _ => &[],
    }
}

fn boolean(value: &PropertyValueEnum) -> Option<bool> {
    match value {
        PropertyValueEnum::Bool(value) => Some(value.value),
        PropertyValueEnum::BitBool(value) => Some(value.value),
        _ => None,
    }
}

fn integer(value: Option<&PropertyValueEnum>) -> Option<i64> {
    Some(match value? {
        PropertyValueEnum::I8(value) => i64::from(value.value),
        PropertyValueEnum::U8(value) => i64::from(value.value),
        PropertyValueEnum::I16(value) => i64::from(value.value),
        PropertyValueEnum::U16(value) => i64::from(value.value),
        PropertyValueEnum::I32(value) => i64::from(value.value),
        PropertyValueEnum::U32(value) => i64::from(value.value),
        PropertyValueEnum::I64(value) => value.value,
        PropertyValueEnum::U64(value) => i64::try_from(value.value).ok()?,
        _ => return None,
    })
}

fn float(value: &PropertyValueEnum) -> Option<f32> {
    match value {
        PropertyValueEnum::F32(value) => Some(value.value),
        _ => None,
    }
}

fn text(value: &PropertyValueEnum) -> Option<&str> {
    match value {
        PropertyValueEnum::String(value) => Some(&value.value),
        _ => None,
    }
}

fn hash(value: &PropertyValueEnum) -> Option<u32> {
    match value {
        PropertyValueEnum::Hash(value) => Some(value.value.as_u32()),
        PropertyValueEnum::ObjectLink(value) => Some(value.value.0),
        _ => None,
    }
}

fn bool_or(value: Option<&PropertyValueEnum>, fallback: bool) -> bool {
    value.and_then(boolean).unwrap_or(fallback)
}

fn float_or(value: Option<&PropertyValueEnum>, fallback: f32) -> f32 {
    value.and_then(float).unwrap_or(fallback)
}

/// Returns a new `ContextualRule` named `name` that plays `short` for the owner.
///
/// The rule carries `CooldownModifications` with `IgnoreTimer` set, which 16,284 of the
/// shipped rules carry, and no condition.
#[must_use]
pub fn rule_template(name: &str, short: &str) -> values::Embedded {
    let string = |text: &str| PropertyValueEnum::from(values::String::new(text.to_owned()));
    let action = values::Struct {
        class_hash: named("ContextualActionPlayVO"),
        properties: [(AUDIENCE_FIELDS[0].1, string(short))]
            .into_iter()
            .collect(),
    };
    let modifications = values::Struct {
        class_hash: named("ContextualActionCooldownModifications"),
        properties: [(IGNORE_TIMER, values::Bool::new(true).into())]
            .into_iter()
            .collect(),
    };

    values::Embedded(values::Struct {
        class_hash: named("ContextualRule"),
        properties: [
            (RULE_NAME, string(name)),
            (RULE_AUDIO_ACTION, action.into()),
            (COOLDOWN_MODIFICATIONS, modifications.into()),
        ]
        .into_iter()
        .collect(),
    })
}

/// One skin whose `mContextualActionData` links a `ContextualActionData` object.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinkingSkin {
    /// The game path of the skin bin.
    pub bin: String,
    /// The path hash of the skin object.
    pub object: u32,
    /// The class hash of the skin object.
    pub class: u32,
    /// `skinAudioProperties.tagEventList`.
    pub tags: Vec<String>,
    /// The voice-over bank units of the skin.
    pub units: Vec<BankUnit>,
    /// The position in the indexes of the first index that declares the skin.
    pub index: usize,
}

impl LinkingSkin {
    /// Returns the row of the skin object.
    #[must_use]
    pub fn row(&self, names: &dyn SiteNames) -> SiteRow {
        site_row(&self.bin, self.object, self.class, None, names)
    }
}

/// Returns the skins whose `mContextualActionData` links `object`, in index order.
///
/// A skin is a bin and an object that hold bank units, so a skin without a bank unit is not
/// listed. The first index that declares a skin wins, so a project's copy of a skin bin comes
/// before the game's, and a game skin that the project relinks to another object is skipped.
#[must_use]
pub fn linking_skins(object: u32, indexes: &[&AudioIndex]) -> Vec<LinkingSkin> {
    let mut skins: Vec<LinkingSkin> = Vec::new();
    for (position, index) in indexes.iter().enumerate() {
        for indexed in index.units() {
            if indexed.holder.contextual != Some(object) {
                continue;
            }
            let declared_before = indexes[..position].iter().any(|earlier| {
                earlier.units().iter().any(|unit| {
                    unit.site.object == indexed.site.object
                        && unit.bin.eq_ignore_ascii_case(&indexed.bin)
                })
            });
            if declared_before {
                continue;
            }

            let found = skins.iter_mut().find(|skin| {
                skin.object == indexed.site.object && skin.bin.eq_ignore_ascii_case(&indexed.bin)
            });
            match found {
                Some(skin) => {
                    if indexed.unit.voice_over {
                        skin.units.push(indexed.unit.clone());
                    }
                }
                None => skins.push(LinkingSkin {
                    bin: indexed.bin.clone(),
                    object: indexed.site.object,
                    class: indexed.site.class,
                    tags: indexed.holder.tags.clone(),
                    units: indexed
                        .unit
                        .voice_over
                        .then(|| indexed.unit.clone())
                        .into_iter()
                        .collect(),
                    index: position,
                }),
            }
        }
    }
    skins
}

#[cfg(test)]
mod tests;

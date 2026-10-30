//! An event bank that takes edits: the bank, its undo history and the bytes that a save writes.
//!
//! "Editing" in `docs/ux/AUDIO.md`. Every edit replaces one object, so each other object keeps
//! its bytes.

use std::collections::HashMap;

use ltk_manager_base::error::{AppError, DomainError, ErrorKind};
use ltk_wwise::bank::BankVersion;
use ltk_wwise::hierarchy::{
    Action, Container, ContainerFields, Object, ObjectKind, PlaylistItem, PropBundle, PropValue,
    PropertyId, Sound, StreamType, Typed,
};
use ltk_wwise::{Bank, ObjectId, SourceId};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use xxhash_rust::xxh64::xxh64;

use crate::bank_set::BankSet;

/// The most steps that the undo history keeps.
const HISTORY_DEPTH: usize = 100;

/// The weight of a playlist item that an added child takes, the Wwise default of 50.
const DEFAULT_WEIGHT: u32 = 50_000;

/// Bit 0 of the `bits` of a random or sequence container: a random pick reads the weights.
pub(crate) const USES_WEIGHTS: u8 = 1;

/// The milliseconds of a second, the unit of a Play action's `DelayTime`.
const MILLIS_PER_SECOND: f32 = 1000.0;

/// The highest value of the low-pass and the high-pass filters.
const FILTER_MAX: f32 = 100.0;

/// A property of a sound, a container or a Play action that an edit sets.
///
/// Each property is edited in the unit of Wwise's property table.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum NodeProperty {
    /// `Volume`, in decibels.
    Volume,
    /// `Pitch`, in cents.
    Pitch,
    /// `LPF`, the low-pass filter from 0 to 100.
    Lpf,
    /// `HPF`, the high-pass filter from 0 to 100.
    Hpf,
    /// `MakeUpGain`, in decibels.
    MakeUpGain,
    /// The delay in seconds: `InitialDelay` of a node, `DelayTime` of a Play action.
    Delay,
    /// `Loop` of a sound: the number of plays, where zero loops forever.
    LoopCount,
}

impl NodeProperty {
    /// The properties that a sound takes.
    pub(crate) const SOUND: &[Self] = &[
        Self::Volume,
        Self::MakeUpGain,
        Self::Pitch,
        Self::Lpf,
        Self::Hpf,
        Self::Delay,
        Self::LoopCount,
    ];

    /// The properties that a container takes.
    pub(crate) const CONTAINER: &[Self] = &[
        Self::Volume,
        Self::MakeUpGain,
        Self::Pitch,
        Self::Lpf,
        Self::Hpf,
        Self::Delay,
    ];

    /// The properties that a Play action takes.
    pub(crate) const PLAY: &[Self] = &[Self::Delay];

    /// Returns the value that an object without the property plays with.
    fn default_value(self) -> f32 {
        match self {
            Self::LoopCount => 1.0,
            Self::Volume | Self::MakeUpGain | Self::Pitch | Self::Lpf | Self::Hpf | Self::Delay => {
                0.0
            }
        }
    }

    /// Returns the property ID of a node's bundle.
    fn node_id(self) -> PropertyId {
        match self {
            Self::Volume => PropertyId::VOLUME,
            Self::Pitch => PropertyId::PITCH,
            Self::Lpf => PropertyId::LPF,
            Self::Hpf => PropertyId::HPF,
            Self::MakeUpGain => PropertyId::MAKE_UP_GAIN,
            Self::Delay => PropertyId::INITIAL_DELAY,
            Self::LoopCount => PropertyId::LOOP,
        }
    }

    /// Returns the value of the property in `props` of a node, in the unit of the edit.
    pub(crate) fn of_node(self, props: &PropBundle) -> f32 {
        let id = self.node_id();
        let value = match self {
            #[expect(clippy::cast_precision_loss, reason = "a loop count is small")]
            Self::LoopCount => props.i32(id).map(|count| count as f32),
            Self::Volume | Self::MakeUpGain | Self::Pitch | Self::Lpf | Self::Hpf | Self::Delay => {
                props.f32(id)
            }
        };
        value.unwrap_or(self.default_value())
    }

    /// Returns the delay of a Play action's `props`, in seconds.
    #[expect(
        clippy::cast_precision_loss,
        reason = "a delay in milliseconds is small"
    )]
    pub(crate) fn action_delay(props: &PropBundle) -> f32 {
        props
            .i32(PropertyId::DELAY_TIME)
            .map_or(0.0, |millis| millis as f32 / MILLIS_PER_SECOND)
    }
}

/// One change to an open event bank, which is one undo step.
///
/// Every ID is the decimal object ID or source ID, which the bank holds as a `u32`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum BankEdit {
    /// Points the Play action `action` at the node `target`.
    Target { action: u32, target: u32 },
    /// Adds the node `child` to the children of `container`, and to its playlist.
    AddChild { container: u32, child: u32 },
    /// Removes `child` from the children of `container`, and from every list that names it.
    RemoveChild { container: u32, child: u32 },
    /// Moves the playlist item of `child` of the random container `container` to `index`.
    MoveChild {
        container: u32,
        child: u32,
        index: u32,
    },
    /// Sets the weight of the playlist item of `child`, and makes the random pick read weights.
    Weight {
        container: u32,
        child: u32,
        weight: u32,
    },
    /// Sets `property` of `object` to `value`. A default value removes the property.
    Property {
        object: u32,
        property: NodeProperty,
        value: f32,
    },
    /// Points the sound `sound` at the media `source`.
    Source { sound: u32, source: u32 },
}

impl BankEdit {
    /// Returns the ID of the object that the edit replaces.
    #[must_use]
    pub fn object(&self) -> u32 {
        match *self {
            Self::Target { action, .. } => action,
            Self::AddChild { container, .. }
            | Self::RemoveChild { container, .. }
            | Self::MoveChild { container, .. }
            | Self::Weight { container, .. } => container,
            Self::Property { object, .. } => object,
            Self::Source { sound, .. } => sound,
        }
    }
}

/// Why an open event bank refused an edit or does not open.
#[derive(Debug, Error)]
pub enum BankEditError {
    /// The bytes are not a bank that `ltk_wwise` reads, or an object does not decode or encode.
    #[error(transparent)]
    Wwise(#[from] ltk_wwise::Error),

    /// The bank has no hierarchy, so it has no object to edit.
    #[error("The bank has no hierarchy, so it has no event to edit")]
    NoHierarchy,

    /// The bank is not version 145.
    #[error(
        "The bank is version {0}, and only a version 145 bank takes edits. Convert it with the \
         Convert repair of its Problems entry, then edit the converted bank."
    )]
    Legacy(u32),

    /// The bank holds no object with the ID.
    #[error(
        "The bank holds no object {0}. An object of another bank of the set is edited in that bank."
    )]
    NoObject(u32),

    /// The object is not of the kind that the edit changes.
    #[error("Object {id} is not {expected}")]
    Kind { id: u32, expected: &'static str },

    /// No bank of the set holds a node with the ID.
    #[error("No bank of the set holds a sound or a container {0}. Pick an object of the bank set.")]
    NoNode(u32),

    /// A child edit of a switch or a layer container, which names its children in its groups.
    #[error("Container {0} is a switch or a layer container, which takes no added or moved child")]
    Grouped(u32),

    /// The child is already a child of the container.
    #[error("Object {child} is already a child of container {container}")]
    AlreadyChild { container: u32, child: u32 },

    /// The child is the container itself.
    #[error("Container {0} cannot be a child of itself")]
    OwnChild(u32),

    /// The container has no child or playlist item with the ID.
    #[error("Container {container} has no child {child}")]
    NotChild { container: u32, child: u32 },

    /// The object does not take the property.
    #[error("Object {id} takes no {property:?} property")]
    Property { id: u32, property: NodeProperty },

    /// The value is outside the range of the property.
    #[error("{value} is not a valid {property:?} value")]
    Value { property: NodeProperty, value: f32 },

    /// No file of the set contains the media that a sound of its stream type plays.
    #[error("No {container} of the bank set contains the media {media}")]
    NoMedia { media: u32, container: &'static str },

    /// A prefetched sound plays its start from a bank and the rest from a package.
    #[error(
        "Sound {0} is prefetched, so its media is in two files and its source ID takes no edit"
    )]
    Prefetched(u32),
}

impl From<BankEditError> for AppError {
    fn from(error: BankEditError) -> Self {
        Self::Domain(DomainError::new(ErrorKind::Preview, error))
    }
}

/// An open event bank, its undo history and the bytes that a save writes.
#[derive(Debug)]
pub struct EventBankDocument {
    bank: Bank,
    /// The objects of the bank as it was opened, by ID.
    opened: HashMap<ObjectId, Object>,
    /// The bank as it now is, written out.
    bytes: Vec<u8>,
    /// The xxh64 of the bytes that the document was read from or last saved as.
    base: u64,
    /// The object that each edit replaced, the last edit last.
    undo: Vec<Object>,
    /// The object that each undo replaced, the last undo last.
    redo: Vec<Object>,
    /// Counts every change.
    revision: u64,
    /// The revision that the bytes at `base` hold.
    saved: u64,
}

impl EventBankDocument {
    /// Reads `bytes` as a bank that takes edits.
    ///
    /// # Errors
    ///
    /// Fails if the bytes are not a bank that `ltk_wwise` reads.
    pub fn parse(bytes: Vec<u8>) -> Result<Self, BankEditError> {
        let bank = Bank::from_reader(&mut bytes.as_slice())?;
        let opened = bank
            .hierarchy()
            .map(|hierarchy| {
                hierarchy
                    .objects()
                    .iter()
                    .map(|object| (object.id(), object.clone()))
                    .collect()
            })
            .unwrap_or_default();

        Ok(Self {
            bank,
            opened,
            base: xxh64(&bytes, 0),
            bytes,
            undo: Vec::new(),
            redo: Vec::new(),
            revision: 0,
            saved: 0,
        })
    }

    /// Returns the bank as it now is, written out.
    #[must_use]
    pub fn bytes(&self) -> &[u8] {
        &self.bytes
    }

    /// Returns the version of the bank.
    #[must_use]
    pub fn version(&self) -> u32 {
        self.bank.header().version.0
    }

    /// Returns `true` if the bank takes edits: a version 145 bank with a hierarchy.
    #[must_use]
    pub fn is_editable(&self) -> bool {
        self.check().is_ok()
    }

    /// Returns the count of changes applied, undone and redone since the open.
    #[must_use]
    pub fn revision(&self) -> u64 {
        self.revision
    }

    /// Returns `true` if the document holds changes that no save wrote.
    #[must_use]
    pub fn is_dirty(&self) -> bool {
        self.revision != self.saved
    }

    /// Returns `true` if `bytes` are the bytes that the document was read from or last saved as.
    #[must_use]
    pub fn is_base(&self, bytes: &[u8]) -> bool {
        xxh64(bytes, 0) == self.base
    }

    /// Returns `true` if the document holds an edit since it was opened, saved or not.
    #[must_use]
    pub fn is_edited(&self) -> bool {
        !self.edited().is_empty()
    }

    /// Returns the IDs of the objects whose bytes differ from the bank as it was opened, in file
    /// order.
    #[must_use]
    pub fn edited(&self) -> Vec<ObjectId> {
        self.bank
            .hierarchy()
            .into_iter()
            .flat_map(|hierarchy| hierarchy.objects())
            .filter(|object| self.opened.get(&object.id()) != Some(*object))
            .map(Object::id)
            .collect()
    }

    /// Applies `edit` as one undo step, with the references checked against `set`.
    ///
    /// `set` is the bank set of the document, opened from [`EventBankDocument::bytes`]. An edit
    /// that leaves the bank unchanged takes no step.
    ///
    /// # Errors
    ///
    /// Fails if the bank is not version 145, if the object is not in the bank or not of the kind
    /// the edit changes, if a new target, child or source is not in `set`, or if the object does
    /// not decode or encode. A refused edit leaves the document unchanged.
    pub fn edit(&mut self, edit: &BankEdit, set: &BankSet) -> Result<(), BankEditError> {
        let version = self.check()?;
        let id = edit.object();
        let current = self.object(id)?;
        let typed = current.decode(version)?.ok_or(BankEditError::Kind {
            id,
            expected: "an action, a sound or a container",
        })?;

        let changed = apply(edit, typed, set)?.encode(version)?;
        if changed == *current {
            return Ok(());
        }

        let previous = self.replace(changed)?;
        self.undo.push(previous);
        if self.undo.len() > HISTORY_DEPTH {
            self.undo.remove(0);
        }
        self.redo.clear();
        self.changed()
    }

    /// Reverts the last edit. Returns `false` if there is no edit to revert.
    ///
    /// # Errors
    ///
    /// Fails if the bank does not write.
    pub fn undo(&mut self) -> Result<bool, BankEditError> {
        let Some(object) = self.undo.pop() else {
            return Ok(false);
        };
        let replaced = self.replace(object)?;
        self.redo.push(replaced);
        self.changed()?;
        Ok(true)
    }

    /// Applies the last reverted edit again. Returns `false` if there is none.
    ///
    /// # Errors
    ///
    /// Fails if the bank does not write.
    pub fn redo(&mut self) -> Result<bool, BankEditError> {
        let Some(object) = self.redo.pop() else {
            return Ok(false);
        };
        let replaced = self.replace(object)?;
        self.undo.push(replaced);
        self.changed()?;
        Ok(true)
    }

    /// Records that [`EventBankDocument::bytes`] are on disk.
    pub fn mark_saved(&mut self) {
        self.base = xxh64(&self.bytes, 0);
        self.saved = self.revision;
    }

    /// Returns the version of the bank if it takes edits.
    fn check(&self) -> Result<BankVersion, BankEditError> {
        let version = self.bank.header().version;
        if version != BankVersion::CURRENT {
            return Err(BankEditError::Legacy(version.0));
        }
        if self.bank.hierarchy().is_none() {
            return Err(BankEditError::NoHierarchy);
        }
        Ok(version)
    }

    fn object(&self, id: u32) -> Result<&Object, BankEditError> {
        self.bank
            .hierarchy()
            .and_then(|hierarchy| hierarchy.get(ObjectId(id)))
            .ok_or(BankEditError::NoObject(id))
    }

    /// Replaces the object with the ID of `object` and returns the object it replaced.
    fn replace(&mut self, object: Object) -> Result<Object, BankEditError> {
        let id = object.id();
        let hierarchy = self
            .bank
            .hierarchy_mut()
            .ok_or(BankEditError::NoHierarchy)?;
        if hierarchy.get(id).is_none() {
            return Err(BankEditError::NoObject(id.0));
        }
        Ok(hierarchy
            .replace(object)
            .expect("the hierarchy holds the object it replaces"))
    }

    /// Writes the bank out again and counts the change.
    fn changed(&mut self) -> Result<(), BankEditError> {
        let mut bytes = Vec::with_capacity(self.bytes.len());
        self.bank.to_writer(&mut bytes)?;
        self.bytes = bytes;
        self.revision += 1;
        Ok(())
    }
}

/// Returns `typed` with `edit` applied, checked against `set`.
fn apply(edit: &BankEdit, typed: Typed, set: &BankSet) -> Result<Typed, BankEditError> {
    let id = edit.object();
    match *edit {
        BankEdit::Target { target, .. } => {
            let mut action = play_action(typed, id)?;
            check_node(set, target, PLAY_TARGETS)?;
            action.target = ObjectId(target);
            Ok(Typed::Action(action))
        }
        BankEdit::AddChild { child, .. } => {
            let mut container = container(typed, id)?;
            add_child(&mut container, child, set)?;
            Ok(Typed::Container(container))
        }
        BankEdit::RemoveChild { child, .. } => {
            let mut container = container(typed, id)?;
            if !container.remove_child(ObjectId(child)) {
                return Err(BankEditError::NotChild {
                    container: id,
                    child,
                });
            }
            Ok(Typed::Container(container))
        }
        BankEdit::MoveChild { child, index, .. } => {
            let mut container = container(typed, id)?;
            let playlist = &mut playlist(&mut container)?.playlist;
            let from = item_of(playlist, id, child)?;
            let item = playlist.remove(from);
            let to = usize::try_from(index).map_or(playlist.len(), |to| to.min(playlist.len()));
            playlist.insert(to, item);
            Ok(Typed::Container(container))
        }
        BankEdit::Weight { child, weight, .. } => {
            let mut container = container(typed, id)?;
            let fields = playlist(&mut container)?;
            let at = item_of(&fields.playlist, id, child)?;
            fields.playlist[at].weight = weight;
            fields.bits |= USES_WEIGHTS;
            Ok(Typed::Container(container))
        }
        BankEdit::Property {
            property, value, ..
        } => set_property(typed, id, property, value),
        BankEdit::Source { source, .. } => {
            let Typed::Sound(mut sound) = typed else {
                return Err(BankEditError::Kind {
                    id,
                    expected: "a sound",
                });
            };
            set_source(&mut sound, source, set)?;
            Ok(Typed::Sound(sound))
        }
    }
}

/// The kinds that a Play action plays.
const PLAY_TARGETS: &[ObjectKind] = &[
    ObjectKind::SOUND,
    ObjectKind::RANDOM_SEQUENCE_CONTAINER,
    ObjectKind::SWITCH_CONTAINER,
    ObjectKind::ACTOR_MIXER,
    ObjectKind::LAYER_CONTAINER,
    ObjectKind::MUSIC_SEGMENT,
    ObjectKind::MUSIC_TRACK,
    ObjectKind::MUSIC_SWITCH_CONTAINER,
    ObjectKind::MUSIC_RANDOM_SEQUENCE_CONTAINER,
];

/// The kinds that a random container or an actor-mixer takes as a child.
pub(crate) const CHILD_KINDS: &[ObjectKind] = &[
    ObjectKind::SOUND,
    ObjectKind::RANDOM_SEQUENCE_CONTAINER,
    ObjectKind::SWITCH_CONTAINER,
    ObjectKind::ACTOR_MIXER,
    ObjectKind::LAYER_CONTAINER,
];

/// Fails if no bank of `set` holds an object `id` of one of `kinds`.
fn check_node(set: &BankSet, id: u32, kinds: &[ObjectKind]) -> Result<(), BankEditError> {
    match set.object(ObjectId(id)) {
        Some((_, _, object)) if kinds.contains(&object.kind()) => Ok(()),
        _ => Err(BankEditError::NoNode(id)),
    }
}

fn play_action(typed: Typed, id: u32) -> Result<Action, BankEditError> {
    match typed {
        Typed::Action(action) if action.action_type.is_play() => Ok(action),
        _ => Err(BankEditError::Kind {
            id,
            expected: "a Play action",
        }),
    }
}

fn container(typed: Typed, id: u32) -> Result<Container, BankEditError> {
    match typed {
        Typed::Container(container) => Ok(container),
        _ => Err(BankEditError::Kind {
            id,
            expected: "a container",
        }),
    }
}

/// Returns the fields of a random container, the kind whose playlist an edit orders and weighs.
fn playlist(
    container: &mut Container,
) -> Result<&mut ltk_wwise::hierarchy::RandomSequenceFields, BankEditError> {
    let id = container.id.0;
    match &mut container.fields {
        ContainerFields::RandomSequence(fields) => Ok(fields),
        _ => Err(BankEditError::Kind {
            id,
            expected: "a random container",
        }),
    }
}

/// Returns the position of the playlist item of `child`.
fn item_of(playlist: &[PlaylistItem], container: u32, child: u32) -> Result<usize, BankEditError> {
    playlist
        .iter()
        .position(|item| item.child == ObjectId(child))
        .ok_or(BankEditError::NotChild { container, child })
}

/// Adds `child` to `container` in ID order, which is the order that shipped banks write.
fn add_child(container: &mut Container, child: u32, set: &BankSet) -> Result<(), BankEditError> {
    let id = container.id.0;
    if matches!(
        container.fields,
        ContainerFields::Switch(_) | ContainerFields::Layer(_)
    ) {
        return Err(BankEditError::Grouped(id));
    }
    if child == id {
        return Err(BankEditError::OwnChild(id));
    }
    if container.children.contains(&ObjectId(child)) {
        return Err(BankEditError::AlreadyChild {
            container: id,
            child,
        });
    }
    check_node(set, child, CHILD_KINDS)?;

    let at = container
        .children
        .partition_point(|existing| existing.0 < child);
    container.children.insert(at, ObjectId(child));
    if let ContainerFields::RandomSequence(fields) = &mut container.fields {
        fields.playlist.push(PlaylistItem {
            child: ObjectId(child),
            weight: DEFAULT_WEIGHT,
        });
    }
    Ok(())
}

fn set_property(
    typed: Typed,
    id: u32,
    property: NodeProperty,
    value: f32,
) -> Result<Typed, BankEditError> {
    check_value(property, value)?;
    let refused = BankEditError::Property { id, property };

    match typed {
        Typed::Sound(mut sound) => {
            set_node_prop(&mut sound.node.props, property, value);
            Ok(Typed::Sound(sound))
        }
        Typed::Container(mut container) if NodeProperty::CONTAINER.contains(&property) => {
            set_node_prop(&mut container.node.props, property, value);
            Ok(Typed::Container(container))
        }
        Typed::Action(mut action)
            if action.action_type.is_play() && NodeProperty::PLAY.contains(&property) =>
        {
            set_delay(&mut action.props, value);
            Ok(Typed::Action(action))
        }
        _ => Err(refused),
    }
}

/// Fails if `value` is outside the range of `property`.
fn check_value(property: NodeProperty, value: f32) -> Result<(), BankEditError> {
    let valid = value.is_finite()
        && match property {
            NodeProperty::Volume | NodeProperty::MakeUpGain | NodeProperty::Pitch => true,
            NodeProperty::Lpf | NodeProperty::Hpf => (0.0..=FILTER_MAX).contains(&value),
            NodeProperty::Delay => value >= 0.0,
            NodeProperty::LoopCount => value >= 0.0 && value.fract() == 0.0,
        };
    if valid {
        Ok(())
    } else {
        Err(BankEditError::Value { property, value })
    }
}

/// Sets `property` of a node's bundle, and removes it at its default value.
fn set_node_prop(props: &mut PropBundle, property: NodeProperty, value: f32) {
    let id = property.node_id();
    if value == property.default_value() {
        props.remove(id);
        return;
    }

    let bits = match property {
        #[expect(
            clippy::cast_possible_truncation,
            reason = "check_value admits a whole loop count only"
        )]
        NodeProperty::LoopCount => PropValue::from_i32(value as i32),
        NodeProperty::Volume
        | NodeProperty::MakeUpGain
        | NodeProperty::Pitch
        | NodeProperty::Lpf
        | NodeProperty::Hpf
        | NodeProperty::Delay => PropValue::from_f32(value),
    };
    props.set(id, bits);
}

/// Sets the `DelayTime` of a Play action to `seconds`, and removes it at zero.
fn set_delay(props: &mut PropBundle, seconds: f32) {
    #[expect(
        clippy::cast_possible_truncation,
        reason = "a delay in milliseconds fits an i32"
    )]
    let millis = (seconds * MILLIS_PER_SECOND).round() as i32;
    if millis == 0 {
        props.remove(PropertyId::DELAY_TIME);
        return;
    }
    props.set(PropertyId::DELAY_TIME, PropValue::from_i32(millis));
}

/// Points `sound` at `source`, a media that a file of `set` of the sound's stream type contains.
fn set_source(sound: &mut Sound, source: u32, set: &BankSet) -> Result<(), BankEditError> {
    let id = SourceId(source);
    match sound.source.stream_type {
        StreamType::DATA_BANK => {
            let media = set.banked_media(id).ok_or(BankEditError::NoMedia {
                media: source,
                container: "media index",
            })?;
            sound.source.in_memory_size = u32::try_from(media.len()).unwrap_or(u32::MAX);
        }
        StreamType::STREAMING => {
            set.package_with_media(id).ok_or(BankEditError::NoMedia {
                media: source,
                container: "package",
            })?;
        }
        _ => return Err(BankEditError::Prefetched(sound.id.0)),
    }
    sound.source.source_id = id;
    Ok(())
}

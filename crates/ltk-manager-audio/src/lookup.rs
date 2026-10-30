//! The sound lookup: an event of a bank set resolved into its play tree.
//!
//! The walk is the event tree query of `ltk_wwise`. The lookup adds what the query leaves out:
//! the objects that no bank contains, the actions that do not decode, and the file of each media.

use std::collections::HashSet;
use std::iter::Peekable;
use std::time::Duration;

use ltk_wwise::hierarchy::{
    ActionType, ContainerFields, ContainerMode, EventAction, EventNode, ObjectKind, PropertyId,
    StreamType, Typed, event_tree,
};
use ltk_wwise::{ObjectId, SourceId};
use serde::Serialize;

use crate::bank_set::BankSet;
use crate::names::EventNames;

/// What an event plays: its actions and the tree of objects under each Play action.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlayTree {
    /// The ID of the event.
    pub event: ObjectId,
    /// The name of the event, or `None` if no name of the lookup hashes to its ID.
    pub name: Option<String>,
    /// The actions of the event, in the order that the client runs them.
    pub actions: Vec<ActionNode>,
}

/// One action of an event.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActionNode {
    /// The ID of the action.
    pub id: ObjectId,
    /// The class of the action, the high byte of its type: `0x0400` is Play.
    ///
    /// `None` if no bank of the set contains the action.
    pub class: Option<u16>,
    /// The object that a Play action plays. `None` for an action of another class, and for a
    /// Play action whose target the lookup visited before.
    pub target: Option<PlayNode>,
    /// The `DelayTime` of the action, without the random offset of its range.
    ///
    /// Zero for a negative delay and for an action that does not decode.
    pub delay: Duration,
}

/// One object under a Play action.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlayNode {
    /// A sound: one media.
    Sound {
        id: ObjectId,
        source: SourceId,
        stream: StreamType,
        media: MediaSite,
    },
    /// A random or sequence container, kind 5. One item of `playlist` plays.
    Random {
        id: ObjectId,
        children: Vec<PlayNode>,
        mode: PlayMode,
        /// The items of the playlist that name a child of `children`, in playlist order.
        playlist: Vec<PlaylistEntry>,
    },
    /// A switch container, kind 6.
    Switch {
        id: ObjectId,
        children: Vec<PlayNode>,
        /// The ID of the switch group or the state group, the FNV-1 hash of its name.
        group: u32,
        /// The switch that plays when the game sets no switch of the group.
        default_switch: u32,
        /// The children that play.
        pick: SwitchPick,
    },
    /// A layer container, kind 9. Every child plays.
    Layer {
        id: ObjectId,
        children: Vec<PlayNode>,
    },
    /// An actor-mixer, kind 7. Every child plays.
    Mixer {
        id: ObjectId,
        children: Vec<PlayNode>,
    },
    /// An object of a kind that the lookup does not play, such as a music object.
    Unsupported { id: ObjectId, kind: ObjectKind },
    /// No bank of the set contains the ID.
    Missing { id: ObjectId },
}

impl PlayNode {
    /// Returns the object ID of the node.
    #[must_use]
    pub fn id(&self) -> ObjectId {
        match self {
            Self::Sound { id, .. }
            | Self::Random { id, .. }
            | Self::Switch { id, .. }
            | Self::Layer { id, .. }
            | Self::Mixer { id, .. }
            | Self::Unsupported { id, .. }
            | Self::Missing { id } => *id,
        }
    }
}

/// How a random or sequence container picks the item of its playlist that plays.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum PlayMode {
    /// One item, picked by weight. A mode that `ltk_wwise` does not name picks this way too.
    Random,
    /// The items in playlist order, so the first press plays the first item.
    Sequence,
}

/// One item of the playlist of a random or sequence container.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct PlaylistEntry {
    /// The index of the child in the `children` of the container.
    pub child: usize,
    /// The weight of the item in a random pick, relative to the other items.
    ///
    /// Every item weighs 1 if the container does not use weights.
    pub weight: u32,
}

/// The children of a switch container that play.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum SwitchPick {
    /// The nodes of the default switch, as indexes into the `children` of the container.
    Default { nodes: Vec<usize> },
    /// The default switch names no child of the container, so the first child plays.
    FirstChild,
}

/// The file of a [`BankSet`] that contains the media of a sound.
///
/// `file` is an index into [`BankSet::files`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum MediaSite {
    /// The media index of a bank contains the media.
    InBank { file: usize },
    /// A package contains the media.
    InPackage { file: usize },
    /// No file of the set contains the media.
    Missing,
}

/// An object of an event that cannot be decoded. The lookup of the event stops.
#[derive(Debug, thiserror::Error)]
#[error("object {object} of {bank} cannot be decoded: {error}")]
pub struct LookupError {
    /// The ID of the object that does not decode, or the event if the error names no object.
    pub object: ObjectId,
    /// The game path of the bank that contains the object.
    pub bank: String,
    /// The error of the decode.
    #[source]
    pub error: ltk_wwise::Error,
}

/// Resolves events of a [`BankSet`] to their play trees.
#[derive(Debug, Clone, Copy)]
pub struct SoundLookup<'a> {
    set: &'a BankSet,
    names: &'a EventNames,
}

impl<'a> SoundLookup<'a> {
    /// Returns a lookup over `set` that names an event from `names`.
    #[must_use]
    pub fn new(set: &'a BankSet, names: &'a EventNames) -> Self {
        Self { set, names }
    }

    /// Resolves the event named `name`. The ID is [`ObjectId::from_name`] of `name`.
    ///
    /// # Errors
    ///
    /// The errors of [`SoundLookup::event`].
    pub fn event_named(&self, name: &str) -> Result<Option<PlayTree>, LookupError> {
        let tree = self.event(ObjectId::from_name(name))?;
        Ok(tree.map(|tree| PlayTree {
            name: Some(name.to_owned()),
            ..tree
        }))
    }

    /// Resolves the event `id` with [`event_tree`] over the banks of the set.
    ///
    /// Returns `None` if the first object `id` of the set is not an event. The walk visits each
    /// object once, and a node that it visited before is left out of a container's children. An
    /// ID that no bank contains is a [`PlayNode::Missing`], and an event or an action in the
    /// place of a node is a [`PlayNode::Unsupported`].
    ///
    /// # Errors
    ///
    /// Fails with a [`LookupError`] if the event, a Play action or a node cannot be decoded.
    pub fn event(&self, id: ObjectId) -> Result<Option<PlayTree>, LookupError> {
        let Some((_, bank, object)) = self.set.object(id) else {
            return Ok(None);
        };
        if object.kind() != ObjectKind::EVENT {
            return Ok(None);
        }

        let banks = self.set.hierarchy_banks();
        let Some(tree) = event_tree(&banks, id).map_err(|error| self.error(id, error))? else {
            return Ok(None);
        };
        let Some(Typed::Event(event)) = object
            .decode(bank.header().version)
            .map_err(|error| self.error(id, error))?
        else {
            return Ok(None);
        };

        let mut convert = Convert {
            set: self.set,
            reported: HashSet::from([id]),
        };
        let mut decoded = tree.actions.into_iter().peekable();
        let mut actions = Vec::with_capacity(event.actions.len());
        for &action in &event.actions {
            if !convert.reported.insert(action) {
                continue;
            }

            let node = match decoded.next_if(|each| each.action.id == action) {
                Some(each) => convert.action(each),
                None => convert.undecoded_action(action),
            };
            actions.push(node);
        }

        Ok(Some(PlayTree {
            event: id,
            name: self.names.get(id).map(str::to_owned),
            actions,
        }))
    }

    /// Returns `error` of the event `event`, placed at the object that it names.
    fn error(&self, event: ObjectId, error: ltk_wwise::Error) -> LookupError {
        let object = match &error {
            ltk_wwise::Error::Layout { id, .. } | ltk_wwise::Error::ActionClass { id, .. } => *id,
            _ => event,
        };
        let bank = self
            .set
            .object(object)
            .map_or_else(String::new, |(file, ..)| {
                self.set.files()[file].path().to_owned()
            });

        LookupError {
            object,
            bank,
            error,
        }
    }
}

/// The conversion of one [`event_tree`] into a [`PlayTree`].
struct Convert<'a> {
    set: &'a BankSet,
    /// The IDs that the conversion reported as an action, a missing or an unsupported node.
    reported: HashSet<ObjectId>,
}

impl Convert<'_> {
    fn action(&mut self, action: EventAction) -> ActionNode {
        let EventAction { action, target } = action;
        let target = match target {
            Some(node) => Some(self.node(node)),
            None if action.action_type.is_play() => self.absent(action.target),
            None => None,
        };
        let delay = action
            .props
            .i32(PropertyId::DELAY_TIME)
            .and_then(|millis| u64::try_from(millis).ok())
            .map_or(Duration::ZERO, Duration::from_millis);

        ActionNode {
            id: action.id,
            class: Some(action.action_type.class()),
            target,
            delay,
        }
    }

    /// Returns the node of an action that [`event_tree`] leaves out: one that no bank contains,
    /// an object of another kind, or an action of a class other than Play that does not decode.
    fn undecoded_action(&self, id: ObjectId) -> ActionNode {
        let class = self
            .set
            .object(id)
            .filter(|(_, _, object)| object.kind() == ObjectKind::ACTION)
            .and_then(|(_, _, object)| action_type(object.payload()))
            .map(ActionType::class);

        ActionNode {
            id,
            class,
            target: None,
            delay: Duration::ZERO,
        }
    }

    fn node(&mut self, node: EventNode) -> PlayNode {
        match node {
            EventNode::Sound(sound) => {
                let (source, stream) = (sound.source.source_id, sound.source.stream_type);
                PlayNode::Sound {
                    id: sound.id,
                    source,
                    stream,
                    media: media(self.set, source, stream),
                }
            }
            EventNode::Other { id, kind } => PlayNode::Unsupported { id, kind },
            EventNode::Container {
                container,
                children,
            } => {
                let id = container.id;
                let mut walked = children.into_iter().peekable();
                let mut nodes = Vec::with_capacity(container.children.len());
                for &child in &container.children {
                    match next_with_id(&mut walked, child) {
                        Some(node) => nodes.push(self.node(node)),
                        None => nodes.extend(self.absent(child)),
                    }
                }

                container_node(id, nodes, container.fields)
            }
        }
    }

    /// Returns the node of an ID that [`event_tree`] gives no node for.
    ///
    /// Returns `None` for an object that the walk visited before, and for an ID reported before.
    fn absent(&mut self, id: ObjectId) -> Option<PlayNode> {
        let node = match self.set.object(id) {
            None => PlayNode::Missing { id },
            Some((_, _, object))
                if matches!(object.kind(), ObjectKind::EVENT | ObjectKind::ACTION) =>
            {
                PlayNode::Unsupported {
                    id,
                    kind: object.kind(),
                }
            }
            Some(_) => return None,
        };
        self.reported.insert(id).then_some(node)
    }
}

/// Returns the next node of `walked` if its ID is `id`.
fn next_with_id(
    walked: &mut Peekable<impl Iterator<Item = EventNode>>,
    id: ObjectId,
) -> Option<EventNode> {
    walked.next_if(|node| event_node_id(node) == id)
}

fn event_node_id(node: &EventNode) -> ObjectId {
    match node {
        EventNode::Sound(sound) => sound.id,
        EventNode::Container { container, .. } => container.id,
        EventNode::Other { id, .. } => *id,
    }
}

/// Returns the node of the container `id` of the kind that `fields` selects.
fn container_node(id: ObjectId, children: Vec<PlayNode>, fields: ContainerFields) -> PlayNode {
    let index_of = |child: ObjectId| children.iter().position(|node| node.id() == child);

    match fields {
        ContainerFields::RandomSequence(fields) => {
            let uses_weights = fields.bits & USES_WEIGHTS != 0;
            let playlist = fields
                .playlist
                .iter()
                .filter_map(|item| {
                    Some(PlaylistEntry {
                        child: index_of(item.child)?,
                        weight: if uses_weights { item.weight } else { 1 },
                    })
                })
                .collect();
            let mode = if fields.mode == ContainerMode::SEQUENCE {
                PlayMode::Sequence
            } else {
                PlayMode::Random
            };

            PlayNode::Random {
                id,
                children,
                mode,
                playlist,
            }
        }
        ContainerFields::Switch(fields) => {
            let nodes: Vec<usize> = fields
                .nodes_of(fields.default_switch)
                .unwrap_or_default()
                .iter()
                .filter_map(|&node| index_of(node))
                .collect();
            let pick = if nodes.is_empty() {
                SwitchPick::FirstChild
            } else {
                SwitchPick::Default { nodes }
            };

            PlayNode::Switch {
                id,
                children,
                group: fields.group,
                default_switch: fields.default_switch,
                pick,
            }
        }
        ContainerFields::Layer(_) => PlayNode::Layer { id, children },
        ContainerFields::ActorMixer => PlayNode::Mixer { id, children },
    }
}

fn media(set: &BankSet, source: SourceId, stream: StreamType) -> MediaSite {
    if stream == StreamType::DATA_BANK {
        return set
            .bank_with_media(source)
            .map_or(MediaSite::Missing, |file| MediaSite::InBank { file });
    }

    /* A prefetched sound contains only its start in the bank, so the package copy plays. */
    set.package_with_media(source)
        .map_or(MediaSite::Missing, |file| MediaSite::InPackage { file })
}

/// Returns the action type of the action payload `payload`: the `u16` after the ID.
fn action_type(payload: &[u8]) -> Option<ActionType> {
    let bytes = payload.get(ACTION_TYPE_OFFSET..)?.first_chunk::<2>()?;
    Some(ActionType(u16::from_le_bytes(*bytes)))
}

/// The offset of the `u16` action type in an action payload, after the object ID.
const ACTION_TYPE_OFFSET: usize = 4;

/// Bit 0 of the `bits` of a random or sequence container: a random pick reads the weights.
const USES_WEIGHTS: u8 = 1;

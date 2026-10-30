//! The sound lookup: an event of a bank set resolved into its play tree.

use std::collections::HashSet;

use ltk_wwise::hierarchy::{Object, ObjectKind, StreamType, Typed};
use ltk_wwise::{ObjectId, SourceId};

use crate::bank_set::BankSet;
use crate::names::EventNames;

/// What an event plays: its actions and the tree of objects under each Play action.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlayTree {
    pub event: ObjectId,
    /// The name of the event, or `None` if no name of the lookup hashes to its ID.
    pub name: Option<String>,
    /// The actions of the event, in the order that the client runs them.
    pub actions: Vec<ActionNode>,
}

/// One action of an event.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActionNode {
    pub id: ObjectId,
    /// The class of the action, the high byte of its type: `0x0400` is Play.
    ///
    /// `None` if no bank of the set holds the action.
    pub class: Option<u16>,
    /// The object that a Play action plays. `None` for an action of another class, and for a
    /// Play action whose target the lookup visited before.
    pub target: Option<PlayNode>,
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
    /// A random or sequence container, kind 5. The viewport plays one child, picked uniformly
    /// until `ltk_wwise` decodes the playlist.
    Random {
        id: ObjectId,
        children: Vec<PlayNode>,
    },
    /// A switch container, kind 6. The viewport plays the first child until `ltk_wwise` decodes
    /// the default switch.
    Switch {
        id: ObjectId,
        children: Vec<PlayNode>,
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
    /// No bank of the set holds the ID.
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

/// The file of a [`BankSet`] that holds the media of a sound.
///
/// `file` is an index into [`BankSet::files`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum MediaSite {
    /// The media index of a bank holds the media.
    InBank { file: usize },
    /// A package holds the media.
    InPackage { file: usize },
    /// No file of the set holds the media.
    Missing,
}

/// An object of an event that cannot be decoded. The lookup of the event stops.
#[derive(Debug, thiserror::Error)]
#[error("object {object} of {bank} cannot be decoded: {error}")]
pub struct LookupError {
    pub object: ObjectId,
    /// The game path of the bank that holds the object.
    pub bank: String,
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

    /// Resolves the event `id`.
    ///
    /// Returns `None` if the first object `id` of the set is not an event. The walk follows each
    /// Play action to its target and each container to its children, and visits each object
    /// once. A node that the walk visited before is left out of a container's children.
    ///
    /// # Errors
    ///
    /// Fails with a [`LookupError`] if an object of the walk cannot be decoded.
    pub fn event(&self, id: ObjectId) -> Result<Option<PlayTree>, LookupError> {
        let Some((file, bank, object)) = self.set.object(id) else {
            return Ok(None);
        };
        let Some(Typed::Event(event)) = self.decode(file, bank.header().version, object)? else {
            return Ok(None);
        };

        let mut walk = Walk {
            lookup: self,
            visited: HashSet::from([id]),
        };
        let actions = event
            .actions
            .iter()
            .filter_map(|&action| walk.action(action).transpose())
            .collect::<Result<_, _>>()?;

        Ok(Some(PlayTree {
            event: id,
            name: self.names.get(id).map(str::to_owned),
            actions,
        }))
    }

    fn decode(
        &self,
        file: usize,
        version: ltk_wwise::bank::BankVersion,
        object: &Object,
    ) -> Result<Option<Typed>, LookupError> {
        object.decode(version).map_err(|error| LookupError {
            object: object.id(),
            bank: self.set.files()[file].path().to_owned(),
            error,
        })
    }

    fn media(&self, source: SourceId, stream: StreamType) -> MediaSite {
        if stream == StreamType::DATA_BANK {
            return self
                .set
                .bank_with_media(source)
                .map_or(MediaSite::Missing, |file| MediaSite::InBank { file });
        }

        /* A prefetched sound holds only its start in the bank, so the package copy plays. */
        self.set
            .package_with_media(source)
            .map_or(MediaSite::Missing, |file| MediaSite::InPackage { file })
    }
}

/// The state of the walk of one event.
struct Walk<'l, 'a> {
    lookup: &'l SoundLookup<'a>,
    visited: HashSet<ObjectId>,
}

impl Walk<'_, '_> {
    /// Returns the node of the action `id`, or `None` if the walk visited it before.
    fn action(&mut self, id: ObjectId) -> Result<Option<ActionNode>, LookupError> {
        if !self.visited.insert(id) {
            return Ok(None);
        }

        let Some((file, bank, object)) = self.lookup.set.object(id) else {
            return Ok(Some(ActionNode {
                id,
                class: None,
                target: None,
            }));
        };
        let class = (object.kind() == ObjectKind::ACTION)
            .then(|| action_class(object.payload()))
            .flatten();

        let target = if class == Some(PLAY_CLASS) {
            match self.lookup.decode(file, bank.header().version, object)? {
                Some(Typed::Action(action)) => self.node(action.target)?,
                _ => None,
            }
        } else {
            None
        };

        Ok(Some(ActionNode { id, class, target }))
    }

    /// Returns the node of the object `id`, or `None` if the walk visited it before.
    fn node(&mut self, id: ObjectId) -> Result<Option<PlayNode>, LookupError> {
        if !self.visited.insert(id) {
            return Ok(None);
        }

        let Some((file, bank, object)) = self.lookup.set.object(id) else {
            return Ok(Some(PlayNode::Missing { id }));
        };
        let kind = object.kind();
        if matches!(kind, ObjectKind::EVENT | ObjectKind::ACTION) {
            return Ok(Some(PlayNode::Unsupported { id, kind }));
        }

        let node = match self.lookup.decode(file, bank.header().version, object)? {
            Some(Typed::Sound(sound)) => PlayNode::Sound {
                id,
                source: sound.source.source_id,
                stream: sound.source.stream_type,
                media: self
                    .lookup
                    .media(sound.source.source_id, sound.source.stream_type),
            },
            Some(Typed::Container(container)) => {
                let mut children = Vec::with_capacity(container.children.len());
                for &child in &container.children {
                    children.extend(self.node(child)?);
                }

                match container.kind() {
                    ObjectKind::RANDOM_SEQUENCE_CONTAINER => PlayNode::Random { id, children },
                    ObjectKind::SWITCH_CONTAINER => PlayNode::Switch { id, children },
                    ObjectKind::LAYER_CONTAINER => PlayNode::Layer { id, children },
                    _ => PlayNode::Mixer { id, children },
                }
            }
            _ => PlayNode::Unsupported { id, kind },
        };
        Ok(Some(node))
    }
}

/// Returns the class of the action payload `payload`: the high byte of the `u16` after the ID.
fn action_class(payload: &[u8]) -> Option<u16> {
    let bytes = payload.get(ACTION_TYPE_OFFSET..)?.first_chunk::<2>()?;
    Some(u16::from_le_bytes(*bytes) & 0xFF00)
}

/// The class of a Play action.
const PLAY_CLASS: u16 = 0x0400;

/// The offset of the `u16` action type in an action payload, after the object ID.
const ACTION_TYPE_OFFSET: usize = 4;

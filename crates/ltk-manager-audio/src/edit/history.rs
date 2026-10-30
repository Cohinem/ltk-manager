//! One edit as a list of changes to the hierarchy and the media files, and its inverse.
//!
//! An edit runs as a [`Tx`]: each change it makes is logged, so the edit reverts as one undo
//! step and a refused edit reverts what it changed before the refusal.

use std::collections::HashSet;

use ltk_wwise::bank::BankVersion;
use ltk_wwise::hierarchy::{Object, ObjectKind, Typed};
use ltk_wwise::{Bank, BankId, Hierarchy, ObjectId, SourceId};

use super::media_file::MediaFile;
use super::{BankEditError, EditContext};
use crate::bank_set::BankContent;

/// One change of an edit, which [`revert`] undoes.
#[derive(Debug, Clone)]
pub(super) enum Change {
    /// An object replaced in place. Holds the object before the change.
    Replaced(Object),
    /// An object appended or inserted at `at`.
    Inserted { at: usize, id: ObjectId },
    /// An object removed from `at`.
    Removed { at: usize, object: Object },
    /// A media added to the media file at `file` of the document.
    MediaAdded { file: usize, source: SourceId },
    /// A media removed from the media file at `file` of the document.
    MediaRemoved {
        file: usize,
        source: SourceId,
        data: Vec<u8>,
    },
}

/// Where an object of the bank set is.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Site {
    /// In the opened bank, which the edit changes.
    Opened,
    /// In the file at this index of the bank set, which no edit changes.
    Other(usize),
}

/// One edit in progress over the opened bank's hierarchy and the document's media files.
pub(super) struct Tx<'d, 'c> {
    pub version: BankVersion,
    /// The bank ID of the opened bank, which its Play actions name and new IDs are drawn from.
    pub bank_id: BankId,
    hierarchy: &'d mut Hierarchy,
    pub media: &'d mut Vec<MediaFile>,
    pub context: &'d EditContext<'c>,
    /// The event names that the edit created.
    pub names: &'d mut Vec<String>,
    changes: Vec<Change>,
    /// The IDs that the edit drew, which a later draw of the same edit skips.
    pub drawn: HashSet<u32>,
}

impl<'d, 'c> Tx<'d, 'c> {
    pub fn new(
        bank: &'d mut Bank,
        media: &'d mut Vec<MediaFile>,
        names: &'d mut Vec<String>,
        context: &'d EditContext<'c>,
    ) -> Result<Self, BankEditError> {
        let version = bank.header().version;
        let bank_id = bank.header().bank_id;
        let hierarchy = bank.hierarchy_mut().ok_or(BankEditError::NoHierarchy)?;
        Ok(Self {
            version,
            bank_id,
            hierarchy,
            media,
            context,
            names,
            changes: Vec::new(),
            drawn: HashSet::new(),
        })
    }

    /// Returns the changes, the first change first.
    pub fn into_changes(self) -> Vec<Change> {
        self.changes
    }

    /// Returns the objects of the opened bank, in file order.
    pub fn objects(&self) -> &[Object] {
        self.hierarchy.objects()
    }

    /// Returns the object `id` of the opened bank.
    pub fn object(&self, id: ObjectId) -> Option<&Object> {
        self.hierarchy.get(id)
    }

    /// Returns the kind of the object `id` and where it is: the opened bank first, then the set.
    pub fn locate(&self, id: ObjectId) -> Option<(ObjectKind, Site)> {
        if let Some(object) = self.hierarchy.get(id) {
            return Some((object.kind(), Site::Opened));
        }

        match self.context.set.object(id) {
            Some((file, _, object)) if file != 0 => Some((object.kind(), Site::Other(file))),
            _ => None,
        }
    }

    /// Decodes the object `id` of the opened bank.
    ///
    /// # Errors
    ///
    /// Fails if the opened bank holds no object `id`, or if it has no typed layout.
    pub fn typed(&self, id: ObjectId) -> Result<Typed, BankEditError> {
        let object = self
            .hierarchy
            .get(id)
            .ok_or(BankEditError::NoObject(id.0))?;
        object.decode(self.version)?.ok_or(BankEditError::Kind {
            id: id.0,
            expected: "an action, a sound or a container",
        })
    }

    /// Decodes the object `id` of the opened bank or of another bank of the set.
    pub fn typed_anywhere(&self, id: ObjectId) -> Option<Typed> {
        if self.hierarchy.get(id).is_some() {
            return self.typed(id).ok();
        }

        let (file, bank, object) = self.context.set.object(id)?;
        if file == 0 {
            return None;
        }
        object.decode(bank.header().version).ok()?
    }

    /// Returns the bank ID of the file that holds the object `id`.
    pub fn bank_of(&self, id: ObjectId) -> BankId {
        match self.locate(id) {
            Some((_, Site::Other(file))) => match self.context.set.files()[file].content() {
                BankContent::Bank { bank } => bank.header().bank_id,
                _ => self.bank_id,
            },
            _ => self.bank_id,
        }
    }

    /// Encodes `typed` in place of the object with its ID. An equal object takes no change.
    ///
    /// # Errors
    ///
    /// Fails if the opened bank holds no object with the ID, or if `typed` does not encode.
    pub fn put(&mut self, typed: &Typed) -> Result<(), BankEditError> {
        let object = typed.encode(self.version)?;
        let current = self
            .hierarchy
            .get(object.id())
            .ok_or(BankEditError::NoObject(object.id().0))?;
        if *current == object {
            return Ok(());
        }

        let previous = self
            .hierarchy
            .replace(object)
            .expect("the hierarchy holds the object it replaces");
        self.changes.push(Change::Replaced(previous));
        Ok(())
    }

    /// Encodes `typed` after the last object.
    ///
    /// # Errors
    ///
    /// Fails if `typed` does not encode.
    pub fn push(&mut self, typed: &Typed) -> Result<(), BankEditError> {
        let object = typed.encode(self.version)?;
        let id = object.id();
        let at = self.hierarchy.len();
        self.hierarchy.push(object);
        self.changes.push(Change::Inserted { at, id });
        Ok(())
    }

    /// Removes the object `id` of the opened bank.
    pub fn remove(&mut self, id: ObjectId) -> Option<Object> {
        let at = self.hierarchy.objects().iter().position(|o| o.id() == id)?;
        let object = self.hierarchy.remove(id)?;
        self.changes.push(Change::Removed {
            at,
            object: object.clone(),
        });
        Some(object)
    }

    /// Adds `data` as the media `source` of the media file at `file`.
    pub fn add_media(&mut self, file: usize, source: SourceId, data: Vec<u8>) {
        self.media[file].add(source, data);
        self.changes.push(Change::MediaAdded { file, source });
    }

    /// Removes the media `source` that the document added to the media file at `file`.
    pub fn remove_media(&mut self, file: usize, source: SourceId) {
        if let Some(data) = self.media[file].remove(source) {
            self.changes
                .push(Change::MediaRemoved { file, source, data });
        }
    }
}

/// Undoes `changes`, the last change first, and returns the changes that redo them.
///
/// # Errors
///
/// Fails if a change names an object that the hierarchy no longer holds where the change put it,
/// which a step history kept in order never does.
pub(super) fn revert(
    hierarchy: &mut Hierarchy,
    media: &mut [MediaFile],
    changes: Vec<Change>,
) -> Result<Vec<Change>, BankEditError> {
    let mut inverse = Vec::with_capacity(changes.len());
    for change in changes.into_iter().rev() {
        let undone = match change {
            Change::Replaced(object) => {
                let id = object.id();
                if hierarchy.get(id).is_none() {
                    return Err(BankEditError::NoObject(id.0));
                }

                let current = hierarchy
                    .replace(object)
                    .expect("the hierarchy holds the object it replaces");
                Change::Replaced(current)
            }
            Change::Inserted { at, id } => {
                let object = hierarchy.remove(id).ok_or(BankEditError::NoObject(id.0))?;
                Change::Removed { at, object }
            }
            Change::Removed { at, object } => {
                let id = object.id();
                insert_at(hierarchy, at, object);
                Change::Inserted { at, id }
            }
            Change::MediaAdded { file, source } => {
                let data = media[file].remove(source).unwrap_or_default();
                Change::MediaRemoved { file, source, data }
            }
            Change::MediaRemoved { file, source, data } => {
                media[file].add(source, data);
                Change::MediaAdded { file, source }
            }
        };
        inverse.push(undone);
    }
    Ok(inverse)
}

/// Inserts `object` at `at`, so every other object keeps its place.
fn insert_at(hierarchy: &mut Hierarchy, at: usize, object: Object) {
    if at >= hierarchy.len() {
        hierarchy.push(object);
        return;
    }

    let mut objects = hierarchy.objects().to_vec();
    objects.insert(at, object);

    let mut rebuilt = Hierarchy::new();
    for each in objects {
        rebuilt.push(each);
    }
    *hierarchy = rebuilt;
}

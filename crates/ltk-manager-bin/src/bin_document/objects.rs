//! A new object or a removed one in a document that writes its own bytes, as an undoable edit.
//! A declared document declares the same edits instead, in `declared::objects`.

use ltk_game_data::EntryName;
use ltk_hash::BinHash;
use ltk_meta::BinObject;

use super::clipboard::copied_object;
use super::declared::{NewObject, clone_as, not_declared, own_named};
use super::edit::{Edit, bin_hash};
use super::{BinDocument, BinDocumentError, EditRejection, hex};
use crate::vfx::vfx_system_template;

impl BinDocument {
    /// Add a new object named `name` from `origin` to a document that writes its own bytes,
    /// answering its path hash.
    ///
    /// A clone rewrites the copy's own path hash where a field holds it.
    ///
    /// # Errors
    ///
    /// As [`BinDocument::create_object`]. A copy from another chunk fails with
    /// [`BinDocumentError::Declaring`], because only a declared document reads the game.
    pub(super) fn create_owned_object(
        &mut self,
        name: &str,
        origin: &NewObject,
    ) -> Result<BinHash, BinDocumentError> {
        let (entry, inverse) = self.put_owned_object(name, origin)?;
        self.record(inverse)?;
        Ok(entry)
    }

    /// Adds a new object named `name` from `origin`, as [`BinDocument::create_owned_object`]
    /// does, and returns its path hash and the edit that reverts it. The edit is not recorded.
    pub(super) fn put_owned_object(
        &mut self,
        name: &str,
        origin: &NewObject,
    ) -> Result<(BinHash, Edit), BinDocumentError> {
        let rejected = |rejection| BinDocumentError::EditRejected {
            address: name.to_owned(),
            rejection,
        };
        let name =
            EntryName::try_from(name.trim()).map_err(|_| rejected(EditRejection::MalformedHash))?;
        let entry = name.object_hash();
        if self.object_at(entry).is_some() {
            return Err(rejected(EditRejection::ObjectExists));
        }

        let object = match origin {
            NewObject::Clone { source } => {
                let source = bin_hash(source).map_err(rejected)?;
                let held =
                    self.object_at(source)
                        .ok_or_else(|| BinDocumentError::NodeNotFound {
                            address: hex(source),
                        })?;
                let spelled = EntryName::try_from(hex(source).as_str())
                    .map_err(|_| rejected(EditRejection::MalformedHash))?;
                clone_as(held, &spelled, &name)
            }
            NewObject::Copy { .. } => return Err(not_declared()),
            NewObject::Class { class } => BinObject::new(entry, bin_hash(class).map_err(rejected)?),
            NewObject::Template { template } => {
                let value = vfx_system_template(template).ok_or_else(|| {
                    BinDocumentError::NodeNotFound {
                        address: template.clone(),
                    }
                })?;
                let mut object = BinObject::new(entry, value.class_hash);
                object.properties = own_named(value, &name).into_iter().collect();
                object
            }
            NewObject::Paste { text } => {
                let value = copied_object(text).map_err(rejected)?;
                let mut object = BinObject::new(entry, value.class_hash);
                object.properties = value.properties.into_iter().collect();
                object
            }
        };

        let index = self.file.objects().len();
        Ok((entry, self.put_object(object, index)?))
    }

    /// Take the object `entry` out of a document that writes its own bytes.
    ///
    /// # Errors
    ///
    /// Fails with [`BinDocumentError::NodeNotFound`] for an object the document does not hold.
    pub(super) fn remove_owned_object(&mut self, entry: BinHash) -> Result<(), BinDocumentError> {
        let inverse = self.take_object(entry)?;
        self.record(inverse)
    }

    /// Put `object` at `index` of the file's objects and mark it touched, answering the edit
    /// that takes it out.
    pub(super) fn put_object(
        &mut self,
        object: BinObject,
        index: usize,
    ) -> Result<Edit, BinDocumentError> {
        let entry = object.path_hash;
        let objects = self.file.objects_mut();
        objects.shift_insert(index.min(objects.len()), entry, object);
        self.touched.insert(entry);
        Ok(Edit::RemoveObject { entry })
    }

    /// Take the object `entry` out of the file and mark it touched, answering the edit that
    /// puts it back where it was.
    pub(super) fn take_object(&mut self, entry: BinHash) -> Result<Edit, BinDocumentError> {
        let (index, _, object) = self
            .file
            .objects_mut()
            .shift_remove_full(&entry)
            .ok_or_else(|| BinDocumentError::NodeNotFound {
                address: hex(entry),
            })?;
        self.touched.insert(entry);
        Ok(Edit::InsertObject { object, index })
    }
}

#[cfg(test)]
mod tests;

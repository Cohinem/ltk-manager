//! A row as the declaration and the reference an author would write for it, and a reference
//! declared in its place. "Declaring from a game bin" in docs/ux/BIN_EDITOR.md.

use ltk_declarations::{Edit as ManifestEdit, Operation, ValueText};
use ltk_game_data::{Reference, Value};
use ltk_hash::BinHash;
use ltk_meta::path::PropertyPath;
use serde::Serialize;

use super::super::{
    BinDocument, BinDocumentError, EditRejection, EntryKey, Node, RowNames, Step, descend, hex,
    parse_steps,
};
use super::{RenderNames, declaring, entry_name, not_declared, value_path};
use crate::error::AppError;

/// What a row copies as. Each half is absent where the row has no spelling for it: the object
/// row itself, a path through a field no table names, and a value holding such a field.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[cfg_attr(feature = "ts", ts(export))]
pub struct RowDeclaration {
    /// An `entries` module setting the row to its value, as it stands under `modules`.
    pub declaration: Option<String>,
    /// The row as a game-copy reference, `<entry>:<property path>`.
    pub reference: Option<String>,
}

impl BinDocument {
    /// The row at `path` under `entry` as a declaration and as a reference.
    ///
    /// # Errors
    ///
    /// Fails with [`BinDocumentError::NodeNotFound`] where the path reaches nothing.
    pub fn row_declaration(
        &self,
        entry: BinHash,
        path: &str,
        names: &dyn RowNames,
    ) -> Result<RowDeclaration, BinDocumentError> {
        let address = || format!("{}:{path}", hex(entry));
        let not_found = || BinDocumentError::NodeNotFound { address: address() };
        let steps = parse_steps(path).ok_or_else(not_found)?;
        let object = self.object_at(entry).ok_or_else(not_found)?;
        let (node, trace) = descend(object, &steps).ok_or_else(not_found)?;
        let Node::Value(value) = node else {
            return Ok(RowDeclaration::default());
        };

        let names = RenderNames(names);
        let Some(property) = spelled_path(&steps, &trace, &names) else {
            return Ok(RowDeclaration::default());
        };
        let name = entry_name(entry, &names);
        let declaration = Value::render(value, &names)
            .ok()
            .and_then(|value| ValueText::try_from(&value).ok())
            .and_then(|text| {
                ManifestEdit {
                    chunk_hash: 0,
                    entry: name.clone(),
                    path: property.clone(),
                    operation: Operation::Set(text),
                }
                .module_text()
            });
        Ok(RowDeclaration {
            declaration,
            reference: Some(format!("{}:{}", name.as_str(), property.as_str())),
        })
    }

    /// Declare the row at `path` under `entry` as the game-copy reference `reference` in the
    /// chosen layer: a set of the row, or with `merge` an addition to its list or map.
    ///
    /// The apply reports a reference the game does not answer on the row, so one is written
    /// all the same.
    ///
    /// # Errors
    ///
    /// Fails with [`BinDocumentError::Declaring`] for a document that declares nothing and for
    /// text that is no reference, and with [`BinDocumentError::EditRejected`] for a path no
    /// declaration spells.
    pub fn declare_reference(
        &mut self,
        entry: BinHash,
        path: &str,
        reference: &str,
        merge: bool,
    ) -> Result<(), BinDocumentError> {
        let nameless = || BinDocumentError::EditRejected {
            address: format!("{}:{path}", hex(entry)),
            rejection: EditRejection::NamelessPath,
        };
        let reference = Reference::parse(reference).map_err(|error| {
            declaring(AppError::ValidationFailed(format!(
                "Not a reference: {error}"
            )))
        })?;
        /* Quoted, so a path holding a bracket or a brace stays one scalar. */
        let quoted = serde_json::to_string(&reference.to_string())
            .map_err(|error| declaring(AppError::Other(error.to_string())))?;
        let text = ValueText::new(format!("!ref {quoted}"))
            .map_err(|error| declaring(AppError::from(error)))?;

        let steps = parse_steps(path).ok_or_else(nameless)?;
        let object = self.object_at(entry).ok_or_else(nameless)?;
        let (_, trace) = descend(object, &steps).ok_or_else(nameless)?;
        let declared = self.declared.as_ref().ok_or_else(not_declared)?;

        let mut edit = None;
        declared.context.game.with_names(&mut |names| {
            let names = RenderNames(names);
            edit = spelled_path(&steps, &trace, &names).map(|property| ManifestEdit {
                chunk_hash: declared.chunk_hash,
                entry: entry_name(entry, &names),
                path: property,
                operation: if merge {
                    Operation::Add(text.clone())
                } else {
                    Operation::Set(text.clone())
                },
            });
        });
        let edit = edit.ok_or_else(nameless)?;

        let written = declared.write(&[edit]).map_err(declaring)?;
        if let Some(written) = written {
            self.declared
                .as_mut()
                .ok_or_else(not_declared)?
                .remember(written);
        }
        self.reapply()
    }
}

/// The property path `steps` walk, or `None` where a declaration does not spell it.
fn spelled_path(
    steps: &[Step],
    trace: &[super::super::Trace<'_>],
    names: &RenderNames<'_>,
) -> Option<PropertyPath> {
    if steps.is_empty()
        || steps
            .iter()
            .any(|step| matches!(step, Step::Key(EntryKey { occurrence, .. }) if *occurrence > 0))
    {
        return None;
    }
    value_path(trace)?.to_property_path(names).ok()
}

#[cfg(test)]
mod tests;

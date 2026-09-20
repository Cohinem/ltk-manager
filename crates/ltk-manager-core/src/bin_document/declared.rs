//! A game bin that takes its edits as declarations of one project layer. ADR-0042.
//!
//! The tree a declared document holds is the game's copy with the declarations of every
//! layer of the project applied in build order. An edit writes one key of the chosen layer's
//! `game_data.yaml` and applies again.

use std::borrow::Cow;
use std::collections::VecDeque;
use std::fmt;
use std::io::Cursor;
use std::sync::Arc;

use ltk_declarations::{Edit as ManifestEdit, Operation, ValueText};
use ltk_game_data::{Edit, EntryName, Module, Names, PropertyEdit, Selector, Sign, Value, apply};
use ltk_hash::{BinHash, WadHash};
use ltk_meta::path::{FieldNames, MapKey, PropertyPath, Subscript, ValuePath};
use ltk_meta::walk::TreeValue as _;
use ltk_meta::{Bin, BinFile, BinObject, PropertyValueEnum};
use ltk_mod_project::{ModProjectLayer, game_data::load_layer};
use serde::Serialize;

use super::edit::UNDO_DEPTH;
use super::{
    BinDocument, BinDocumentError, EditRejection, EntryKey, LeafValue, RowNames, Step, Trace,
    descend, hex, parse_steps,
};
use crate::error::{AppError, AppResult, Utf8PathRefExt as _};
use crate::meta_schema::PatchSchema;

use crate::workshop::ProjectDir;

/// The layer a declared document writes to until a reader picks another.
pub const BASE_LAYER: &str = ModProjectLayer::BASE_NAME;

/// The installed game, as a declared document reads it.
pub trait GameCopy: Send + Sync {
    /// The bytes of the first chunk declaring `entry` in the game index's order, for a
    /// reference that names it. `None` where the game declares no such entry.
    ///
    /// # Errors
    ///
    /// A chunk the game holds and the read could not reach.
    fn declaring_chunk(&self, entry: BinHash) -> AppResult<Option<Vec<u8>>>;

    /// Run `read` with the names a declaration spells its hashes by.
    fn with_names(&self, read: &mut dyn FnMut(&dyn RowNames));
}

/// What a declared document applies and writes with.
pub struct DeclareContext {
    pub project: ProjectDir,
    pub schema: PatchSchema,
    pub game: Arc<dyn GameCopy>,
}

/// The declaring half of a [`BinDocument`] over a game chunk.
pub(super) struct Declared {
    context: DeclareContext,
    chunk_hash: u64,
    /// The game's copy, which every apply starts from.
    game: Vec<u8>,
    /// The same copy as a tree, which a mark reads the game's value off.
    game_tree: Bin,
    layer: String,
    /// The project's layers in build order.
    layers: Vec<String>,
    marks: Vec<DeclaredMark>,
    undo: VecDeque<TextEdit>,
    redo: Vec<TextEdit>,
}

impl fmt::Debug for Declared {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Declared")
            .field("project", &self.context.project.path())
            .field("chunk_hash", &format_args!("{:016x}", self.chunk_hash))
            .field("layer", &self.layer)
            .field("marks", &self.marks.len())
            .finish_non_exhaustive()
    }
}

/// One manifest write as an undo stack holds it.
#[derive(Debug, Clone, PartialEq, Eq)]
struct TextEdit {
    layer: String,
    before: String,
    after: String,
}

/// What a declared document says beside its rows.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[cfg_attr(feature = "ts", ts(export))]
pub struct DeclaredState {
    /// The layer an edit writes to.
    pub layer: String,
    /// The project's layers in build order.
    pub layers: Vec<String>,
    /// The rows a declaration of `layer` touches.
    pub marks: Vec<DeclaredMark>,
}

/// One row a declaration of the chosen layer touches.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[cfg_attr(feature = "ts", ts(export))]
pub struct DeclaredMark {
    /// The object's path hash, `0x` and eight hex digits.
    pub entry: String,
    /// The row's path on the wire. Empty where the declared path reaches no row.
    pub path: String,
    pub sign: DeclaredSign,
    /// The game's value as a declaration spells it. Absent where the game holds none, and
    /// for a value that does not render.
    pub game: Option<String>,
}

/// The sign of a declared key.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[cfg_attr(feature = "ts", ts(export))]
pub enum DeclaredSign {
    Set,
    Add,
    Remove,
}

impl From<Sign> for DeclaredSign {
    fn from(sign: Sign) -> Self {
        match sign {
            Sign::Set => Self::Set,
            Sign::Add => Self::Add,
            Sign::Remove => Self::Remove,
        }
    }
}

impl BinDocument {
    /// The game chunk `game` as a declared document of `context`'s project.
    ///
    /// # Errors
    ///
    /// Fails with [`BinDocumentError::Unreadable`] when the bytes are not a bin, and with
    /// [`BinDocumentError::Declaring`] when the project does not read or the game's copy
    /// takes no declarations, which a `PTCH` and a legacy `PROP` do not.
    pub fn declare(
        game: impl Into<Vec<u8>>,
        chunk_hash: u64,
        context: DeclareContext,
    ) -> Result<Self, BinDocumentError> {
        let game = game.into();
        let game_tree = match BinFile::from_reader(&mut Cursor::new(&game))? {
            BinFile::Prop(bin) => bin,
            BinFile::Override(_) => {
                return Err(BinDocumentError::ReadOnly(super::ReadOnly::Patch));
            }
        };
        let mut declared = Declared {
            context,
            chunk_hash,
            game,
            game_tree,
            layer: BASE_LAYER.to_owned(),
            layers: Vec::new(),
            marks: Vec::new(),
            undo: VecDeque::new(),
            redo: Vec::new(),
        };
        let bytes = declared.apply().map_err(declaring)?;
        let mut document = Self::parse(bytes)?;
        declared.mark(&document.file);
        document.declared = Some(declared);
        Ok(document)
    }

    /// What the document says beside its rows, or `None` for one that declares nothing.
    #[must_use]
    pub fn declared_state(&self) -> Option<DeclaredState> {
        self.declared.as_ref().map(|declared| DeclaredState {
            layer: declared.layer.clone(),
            layers: declared.layers.clone(),
            marks: declared.marks.clone(),
        })
    }

    /// Write the edits that follow to `layer`.
    ///
    /// # Errors
    ///
    /// Fails with [`BinDocumentError::Declaring`] for a document that declares nothing and
    /// for a layer the project does not hold.
    pub fn declare_into(&mut self, layer: &str) -> Result<DeclaredState, BinDocumentError> {
        let Self { declared, file, .. } = self;
        let declared = declared.as_mut().ok_or_else(not_declared)?;
        if !declared.layers.iter().any(|held| held == layer) {
            return Err(declaring(AppError::ValidationFailed(format!(
                "The project holds no layer {layer}"
            ))));
        }
        layer.clone_into(&mut declared.layer);
        declared.mark(file);
        Ok(self.declared_state().expect("the document declares"))
    }

    /// Refuse an edit no declaration expresses, on a document that declares.
    pub(super) fn refuse_undeclarable(
        &self,
        entry: BinHash,
        path: &str,
    ) -> Result<(), BinDocumentError> {
        if !self.declares() {
            return Ok(());
        }
        Err(BinDocumentError::EditRejected {
            address: format!("{}:{path}", hex(entry)),
            rejection: EditRejection::Undeclarable,
        })
    }

    /// Set the leaf at `path` under `entry` by declaring it in the chosen layer.
    pub(super) fn declare_leaf(
        &mut self,
        entry: BinHash,
        path: &str,
        value: LeafValue,
    ) -> Result<LeafValue, BinDocumentError> {
        let held = self.apply_leaf(entry, path, value)?;
        let outcome = self.declare_value_at(entry, path);
        /* The tree is the apply's and never the edit's, so a refused write leaves no trace. */
        let applied = self.reapply();
        outcome?;
        applied?;
        Ok(held)
    }

    /// Declare the value the tree holds at `path` as a set of the chosen layer.
    fn declare_value_at(&mut self, entry: BinHash, path: &str) -> Result<(), BinDocumentError> {
        let address = || format!("{}:{path}", hex(entry));
        let not_found = || BinDocumentError::NodeNotFound { address: address() };
        let nameless = || BinDocumentError::EditRejected {
            address: address(),
            rejection: EditRejection::NamelessPath,
        };

        let steps = parse_steps(path).ok_or_else(not_found)?;
        let object = self.object_at(entry).ok_or_else(not_found)?;
        let (node, trace) = descend(object, &steps).ok_or_else(not_found)?;
        let super::Node::Value(value) = node else {
            return Err(not_found());
        };
        if steps
            .iter()
            .any(|step| matches!(step, Step::Key(EntryKey { occurrence, .. }) if *occurrence > 0))
        {
            return Err(nameless());
        }
        let walked = value_path(&trace).ok_or_else(nameless)?;

        let declared = self.declared.as_ref().ok_or_else(not_declared)?;
        let mut spelled = None;
        declared.context.game.with_names(&mut |names| {
            let names = RenderNames(names);
            spelled = Some((|| {
                let path = walked.to_property_path(&names).ok()?;
                let value = Value::render(value, &names).ok()?;
                Some((path, value, entry_name(entry, &names)))
            })());
        });
        let (property, value, name) = spelled.flatten().ok_or_else(nameless)?;

        let declared = self.declared.as_mut().ok_or_else(not_declared)?;
        declared
            .write(&ManifestEdit {
                chunk_hash: declared.chunk_hash,
                entry: name,
                path: property,
                operation: Operation::Set(
                    ValueText::try_from(&value)
                        .map_err(AppError::from)
                        .map_err(declaring)?,
                ),
            })
            .map_err(declaring)
    }

    /// Restore the manifest text from before the latest edit, answering whether one was held.
    pub(super) fn undo_declared(&mut self) -> Result<bool, BinDocumentError> {
        let declared = self.declared.as_mut().ok_or_else(not_declared)?;
        let Some(edit) = declared.undo.pop_back() else {
            return Ok(false);
        };
        if let Err(error) = declared.put(&edit.layer, &edit.after, &edit.before) {
            declared.undo.push_back(edit);
            return Err(declaring(error));
        }
        declared.redo.push(edit);
        self.reapply()?;
        Ok(true)
    }

    /// Restore the manifest text the latest undone edit wrote, answering whether one was held.
    pub(super) fn redo_declared(&mut self) -> Result<bool, BinDocumentError> {
        let declared = self.declared.as_mut().ok_or_else(not_declared)?;
        let Some(edit) = declared.redo.pop() else {
            return Ok(false);
        };
        if let Err(error) = declared.put(&edit.layer, &edit.before, &edit.after) {
            declared.redo.push(edit);
            return Err(declaring(error));
        }
        declared.undo.push_back(edit);
        self.reapply()?;
        Ok(true)
    }

    /// Apply the project's declarations over the game's copy again, replacing the tree.
    pub(super) fn reapply(&mut self) -> Result<(), BinDocumentError> {
        let declared = self.declared.as_mut().ok_or_else(not_declared)?;
        let bytes = declared.apply().map_err(declaring)?;
        let fresh = Self::parse(bytes)?;
        declared.mark(&fresh.file);
        self.file = fresh.file;
        self.base = fresh.base;
        self.touched.clear();
        Ok(())
    }
}

impl Declared {
    /// The game's copy with every layer's declarations applied, in build order.
    fn apply(&mut self) -> AppResult<Vec<u8>> {
        let project = &self.context.project;
        let root = project.path().try_as_utf8("project directory")?;
        let mut layers = project.config()?.layers;
        layers.sort_by(ModProjectLayer::apply_order);
        self.layers = layers.into_iter().map(|layer| layer.name).collect();
        if !self.layers.contains(&self.layer) {
            BASE_LAYER.clone_into(&mut self.layer);
        }

        let ignore = project.ignore_filter()?;
        let entries: Vec<BinHash> = self.game_tree.objects.keys().copied().collect();
        let mut bytes = self.game.clone();
        for layer in &self.layers {
            let loaded = load_layer(root, layer, &ignore);
            let Ok(Some(declarations)) = &loaded.declarations else {
                continue;
            };
            let edits: Vec<Edit> = declarations
                .modules
                .iter()
                .flat_map(|module| edits_on(module, self.chunk_hash, &entries))
                .collect();
            if edits.is_empty() {
                continue;
            }
            let game = &self.context.game;
            let applied = apply(
                &bytes,
                &edits,
                |path| {
                    let file = loaded
                        .override_files()
                        .iter()
                        .find(|file| file.path == *path)
                        .ok_or_else(|| {
                            ltk_game_data::Error::in_document(
                                ltk_game_data::ErrorKind::InputMissing,
                                path.as_str(),
                            )
                        })?;
                    fs_err::read(&file.source)
                        .map_err(|error| ltk_game_data::Error::io(path.as_str(), &error))
                },
                |entry| read_entry(game.as_ref(), entry),
                &self.context.schema,
            )
            .map_err(|error| AppError::Other(format!("The declarations do not apply: {error}")))?;
            bytes = applied.bytes;
        }
        Ok(bytes)
    }

    /// Read the rows the chosen layer's declarations touch, against the applied `file`.
    fn mark(&mut self, file: &BinFile) {
        self.marks.clear();
        let Ok(root) = self.context.project.path().try_as_utf8("project directory") else {
            return;
        };
        let Ok(ignore) = self.context.project.ignore_filter() else {
            return;
        };
        let Ok(Some(declarations)) = load_layer(root, &self.layer, &ignore).declarations else {
            return;
        };
        let BinFile::Prop(applied) = file else {
            return;
        };
        let held: Vec<BinHash> = applied.objects.keys().copied().collect();

        let mut marks = Vec::new();
        self.context.game.with_names(&mut |names| {
            let names = RenderNames(names);
            for module in &declarations.modules {
                for edit in edits_on(module, self.chunk_hash, &held) {
                    for (name, properties) in &edit.entries {
                        let entry = name.object_hash();
                        let Some(object) = applied.objects.get(&entry) else {
                            continue;
                        };
                        let before = self.game_tree.objects.get(&entry);
                        for property in properties {
                            marks.extend(marks_of(entry, object, before, property, &names));
                        }
                    }
                }
            }
        });
        self.marks = marks;
    }

    /// Apply `edit` to the chosen layer's manifest and write it, holding the texts for an undo.
    fn write(&mut self, edit: &ManifestEdit) -> AppResult<()> {
        let mut manifest = self.context.project.declarations_manifest(&self.layer)?;
        let before = manifest.text().to_owned();
        manifest.edit(edit)?;
        manifest.write()?;
        let after = manifest.text().to_owned();
        if before != after {
            if self.undo.len() == UNDO_DEPTH {
                self.undo.pop_front();
            }
            self.undo.push_back(TextEdit {
                layer: self.layer.clone(),
                before,
                after,
            });
            self.redo.clear();
        }
        Ok(())
    }

    /// Replace the text `from` of `layer`'s manifest with `to`.
    ///
    /// A manifest holding another text was edited since, by hand or by another document,
    /// and is left as it is.
    fn put(&self, layer: &str, from: &str, to: &str) -> AppResult<()> {
        let mut manifest = self.context.project.declarations_manifest(layer)?;
        if manifest.text() != from {
            return Err(ltk_declarations::Error::ChangedOnDisk {
                path: manifest.path().to_owned(),
            }
            .into());
        }
        manifest.restore(to)?;
        manifest.write()?;
        Ok(())
    }
}

/// The game's copy of the entry a reference names, as the overlay reads it.
fn read_entry(
    game: &dyn GameCopy,
    entry: &EntryName,
) -> Result<Option<BinObject>, ltk_game_data::Error> {
    let failed = |detail: &dyn fmt::Display| ltk_game_data::Error::io(entry.as_str(), detail);
    let object = entry.object_hash();
    let Some(bytes) = game
        .declaring_chunk(object)
        .map_err(|error| failed(&error))?
    else {
        return Ok(None);
    };
    let mut stream =
        ltk_meta::BinStream::mount(Cursor::new(bytes)).map_err(|error| failed(&error))?;
    let Some(mut found) = stream.object(object).map_err(|error| failed(&error))? else {
        return Err(failed(&"the chunk does not hold the object"));
    };
    found.read().map(Some).map_err(|error| failed(&error))
}

/// The edits `module` makes on the chunk `chunk_hash`, whose objects are `entries`.
///
/// A `target` module edits the chunk it names. An `entries` module edits each entry the
/// chunk declares, as one edit per entry, which is how the overlay lowers it.
fn edits_on(module: &Module, chunk_hash: u64, entries: &[BinHash]) -> Vec<Edit> {
    match &module.selector {
        Selector::Target { target, edits } if target.chunk_hash() == chunk_hash => edits.clone(),
        Selector::Entries(named) => named
            .iter()
            .filter(|(name, _)| entries.contains(&name.object_hash()))
            .map(|(name, edit)| {
                let mut lowered = Edit::default();
                lowered
                    .entries
                    .insert(name.clone(), edit.properties.clone());
                lowered.links = edit.links.clone();
                lowered
            })
            .collect(),
        _ => Vec::new(),
    }
}

/// The marks one property edit leaves on `object`, the applied copy of `entry`.
///
/// A set whose value is a block on a struct descends to the keys of the block, as the apply
/// does.
fn marks_of(
    entry: BinHash,
    object: &BinObject,
    game: Option<&BinObject>,
    property: &PropertyEdit,
    names: &RenderNames<'_>,
) -> Vec<DeclaredMark> {
    let block = match &property.value {
        Value::Mapping(block)
            if property.sign == Sign::Set
                && property.value.pin().is_none()
                && property.value.reference().is_none()
                && matches!(
                    object.resolve(&property.path),
                    Ok(PropertyValueEnum::Struct(_) | PropertyValueEnum::Embedded(_))
                ) =>
        {
            Some(block)
        }
        _ => None,
    };
    if let Some(block) = block {
        return block
            .iter()
            .filter_map(|(key, value)| {
                let inner = PropertyEdit::parse(key, value.clone()).ok()?;
                let path = PropertyPath::new(format!(
                    "{}.{}",
                    property.path.as_str(),
                    inner.path.as_str()
                ))
                .ok()?;
                Some(PropertyEdit { path, ..inner })
            })
            .flat_map(|inner| marks_of(entry, object, game, &inner, names))
            .collect();
    }

    vec![DeclaredMark {
        entry: hex(entry),
        path: wire_path(object, &property.path).unwrap_or_default(),
        sign: property.sign.into(),
        game: game
            .and_then(|game| game.resolve(&property.path).ok())
            .and_then(|value| Value::render(value, names).ok())
            .and_then(|value| value.to_yaml().ok()),
    }]
}

/// The wire path of the node `path` resolves to on `object`, or `None` where it reaches none.
fn wire_path(object: &BinObject, path: &PropertyPath) -> Option<String> {
    let mut wire = String::new();
    let mut walked: Option<PropertyPath> = None;
    for segment in path.segments() {
        let name = segment.name_hash();
        if !wire.is_empty() {
            wire.push('.');
        }
        wire.push_str(&format!("{:08x}", *name));
        let field = match &walked {
            Some(walked) => PropertyPath::new(format!("{}.{}", walked.as_str(), segment.name)),
            None => PropertyPath::new(segment.name),
        }
        .ok()?;
        let Some(subscript) = &segment.subscript else {
            object.resolve(&field).ok()?;
            walked = Some(field);
            continue;
        };
        let holder = object.resolve(&field).ok()?;
        let full = PropertyPath::new(format!("{}{subscript}", field.as_str())).ok()?;
        let reached = object.resolve(&full).ok()?;
        match (subscript, holder) {
            (Subscript::Index(index), _) => wire.push_str(&format!("[{index}]")),
            (Subscript::Key(_), PropertyValueEnum::Map(map)) => {
                let at = map
                    .entries()
                    .iter()
                    .position(|(_, value)| std::ptr::eq(value, reached))?;
                wire.push_str(&EntryKey::of(map.entries(), at).to_string());
            }
            _ => return None,
        }
        walked = Some(full);
    }
    Some(wire)
}

/// The value path `trace` walked, or `None` where a map key is of a kind no path spells.
fn value_path(trace: &[Trace<'_>]) -> Option<ValuePath> {
    let mut path = ValuePath::new();
    for step in trace {
        match step {
            Trace::Field { class, field } => path.push_field(*field, (*class)?),
            Trace::Index(index) => path.push_index(*index),
            Trace::Key(key) => path.push_key(MapKey::from_leaf(key.as_leaf().ok()??)?),
        }
    }
    Some(path)
}

/// The entry as a new key names it: its name where the tables hold one a key takes, else
/// its hash.
fn entry_name(entry: BinHash, names: &RenderNames<'_>) -> EntryName {
    names
        .entry(entry)
        .and_then(|name| EntryName::try_from(name.as_ref()).ok())
        .filter(|name| name.object_hash() == entry)
        .unwrap_or_else(|| {
            EntryName::try_from(hex(entry).as_str()).expect("a spelled hash is an entry name")
        })
}

/// The manager's tables as a declaration's names.
struct RenderNames<'a>(&'a dyn RowNames);

impl RenderNames<'_> {
    fn one(
        hash: BinHash,
        each: impl FnOnce(&[BinHash], &mut dyn FnMut(usize, &str)),
    ) -> Option<Cow<'static, str>> {
        let mut found = None;
        each(&[hash], &mut |_, name| found = Some(name.to_owned()));
        found.map(Cow::Owned)
    }
}

impl FieldNames for RenderNames<'_> {
    fn field(&self, field: BinHash, _class: Option<BinHash>) -> Option<Cow<'_, str>> {
        Self::one(field, |hashes, visit| self.0.for_each_field(hashes, visit))
    }

    fn hash(&self, hash: BinHash) -> Option<Cow<'_, str>> {
        Self::one(hash, |hashes, visit| self.0.for_each_value(hashes, visit))
    }
}

impl Names for RenderNames<'_> {
    fn class(&self, class: BinHash) -> Option<Cow<'_, str>> {
        Self::one(class, |hashes, visit| self.0.for_each_class(hashes, visit))
    }

    fn entry(&self, entry: BinHash) -> Option<Cow<'_, str>> {
        Self::one(entry, |hashes, visit| self.0.for_each_entry(hashes, visit))
    }

    fn file(&self, chunk: u64) -> Option<Cow<'_, str>> {
        let mut found = None;
        self.0.for_each_chunk(&[WadHash(chunk)], &mut |_, name| {
            found = Some(name.to_owned())
        });
        found.map(Cow::Owned)
    }
}

fn declaring(error: AppError) -> BinDocumentError {
    BinDocumentError::Declaring(Box::new(error))
}

fn not_declared() -> BinDocumentError {
    declaring(AppError::Other(
        "The document declares into no project".to_owned(),
    ))
}

#[cfg(test)]
mod tests;

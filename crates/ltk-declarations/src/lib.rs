//! Edits a layer's game data declarations manifest in place (ltk-manager
//! ADR-0042).
//!
//! [`Manifest`] holds a layer's `game_data.yaml` as text and takes one [`Edit`]
//! at a time:
//!
//! - An edit to a key some module already declares, in dotted or block form,
//!   replaces that key's value where it stands. Where several modules declare
//!   it, the last one is edited.
//! - A new key joins the last `entries` module naming the entry, inside the
//!   deepest block its path runs through. An entry no `entries` module names
//!   joins the last module where that is an `entries` module, else a new
//!   trailing `entries` module.
//! - A `target` module is edited only where the key already exists.
//!
//! Comments, blank lines, key order and the spelling of every other key are
//! kept. Each edited text loads through [`ltk_game_data::load_declarations`]
//! before it replaces the held text. A write compares the file on disk with
//! the bytes read and refuses on a difference.
//!
//! ```
//! use ltk_declarations::{Edit, Manifest, Operation, ValueText};
//!
//! let layer = tempfile::tempdir()?;
//! let mut manifest = Manifest::read(layer.path())?;
//! manifest.edit(&Edit {
//!     chunk_hash: ltk_game_data::path_hash("data/characters/teemo/skins/skin0.bin"),
//!     entry: "Characters/Teemo/Skins/Skin0".try_into()?,
//!     path: "skinMeshProperties.selfIllumination".parse()?,
//!     operation: Operation::Set(ValueText::new("0.37")?),
//! })?;
//! manifest.write()?;
//!
//! assert_eq!(
//!     std::fs::read_to_string(layer.path().join("game_data.yaml"))?,
//!     "\
//! version: 1
//! modules:
//!   - entries:
//!       Characters/Teemo/Skins/Skin0:
//!         skinMeshProperties.selfIllumination: 0.37
//! ",
//! );
//! # Ok::<(), Box<dyn std::error::Error>>(())
//! ```

#![warn(missing_docs)]

mod document_text;
mod edit;
mod line_ending;
mod locate;
mod syntax;
#[cfg(test)]
mod tests;

use std::path::{Path, PathBuf};

use fs_err as fs;
use ltk_game_data::{
    Declarations, EntryName, Error as GameDataError, ErrorKind as GameDataErrorKind,
    MANIFEST_NAMES, Sign, load_declarations,
};
use ltk_meta::path::PropertyPath;

use self::document_text::DocumentText;
use self::line_ending::LineEnding;

/// The manifest file a layer with none gains.
pub const FILE_NAME: &str = "game_data.yaml";

/// A value as YAML text: one node, starting at column 0.
///
/// The text `ltk_game_data`'s value rendering writes. A mapping or a list may
/// span lines, in block or flow form, and may carry a local tag.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ValueText(String);

impl ValueText {
    /// A value from its YAML text, trailing whitespace dropped.
    ///
    /// # Errors
    ///
    /// [`Error::InvalidValue`] for text that is empty or does not parse as one
    /// YAML node.
    pub fn new(text: impl Into<String>) -> Result<Self, Error> {
        let mut text = text.into();
        text.truncate(text.trim_end().len());
        if text.is_empty() {
            return Err(Error::InvalidValue("the text is empty".to_owned()));
        }
        let doc =
            syntax::parse(&text).map_err(|refusal| Error::InvalidValue(refusal.to_string()))?;
        if syntax::root(&doc).is_none() {
            return Err(Error::InvalidValue(
                "the text holds no YAML node".to_owned(),
            ));
        }
        Ok(Self(text))
    }

    /// The YAML text.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// What a declaration does to one property.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Operation {
    /// Replace the property's value: an unsigned key.
    Set(ValueText),
    /// Add elements to a list, or entries to a map: a `+` key. They join an
    /// existing `+` key's value.
    Add(ValueText),
    /// Remove elements from a list, or keys from a map: a `-` key. They join
    /// an existing `-` key's value, once.
    Remove(ValueText),
    /// Drop the key with this sign. A body, a block or a module it leaves
    /// empty goes with it. Dropping a key nothing declares changes nothing.
    Drop(Sign),
}

impl Operation {
    /// The sign of the key the operation writes or drops.
    #[must_use]
    pub fn sign(&self) -> Sign {
        match self {
            Self::Set(_) => Sign::Set,
            Self::Add(_) => Sign::Add,
            Self::Remove(_) => Sign::Remove,
            Self::Drop(sign) => *sign,
        }
    }

    /// The value the operation writes, `None` for a drop.
    #[must_use]
    pub fn value(&self) -> Option<&ValueText> {
        match self {
            Self::Set(value) | Self::Add(value) | Self::Remove(value) => Some(value),
            Self::Drop(_) => None,
        }
    }
}

/// One edit of one property of one entry, as a document showing one chunk
/// makes it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Edit {
    /// The path hash of the chunk the document shows, as
    /// [`ltk_game_data::path_hash`] computes it. A `target` module is edited
    /// only when it targets this chunk.
    pub chunk_hash: u64,
    /// The entry, spelled as a new key names it: its name, else its hash.
    pub entry: EntryName,
    /// The property path, without a sign.
    pub path: PropertyPath,
    /// What the edit does.
    pub operation: Operation,
}

/// Why an edit cannot be placed in a manifest's text.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[non_exhaustive]
pub enum Refusal {
    /// The text is not YAML.
    #[error("the text does not parse as YAML: {0}")]
    Syntax(String),
    /// The text holds no document.
    #[error("the text holds no YAML document")]
    NoDocument,
    /// The document is not a mapping.
    #[error("the manifest's root is not a mapping")]
    RootNotMapping,
    /// `modules` is a flow list, which takes no block module.
    #[error("`modules` is a flow list, and a module joins a block list only")]
    ModulesNotBlock,
    /// A flow collection meets a value that spans lines or is a block
    /// collection.
    #[error("a flow mapping or list takes one-line flow values only")]
    FlowValue,
    /// An addition or removal meets a declared value of another shape.
    #[error("the declared value is not a list or a map like the one joining it")]
    MergeShape,
    /// The edited text does not load. The writer placed the edit wrongly.
    #[error("the edited text does not load: {0}")]
    DoesNotLoad(String),
}

/// A failure to read, edit or write a manifest.
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum Error {
    /// The file on disk is not the one read. Nothing was written.
    #[error("{} changed since it was read", path.display())]
    ChangedOnDisk {
        /// The manifest file.
        path: PathBuf,
    },
    /// The layer's manifest is JSON or TOML, which is not edited.
    #[error("{} is not YAML, and only game_data.yaml is edited", path.display())]
    NotYaml {
        /// The manifest file.
        path: PathBuf,
    },
    /// The manifest does not load, or the layer holds more than one.
    #[error("{} does not load: {message}", path.display())]
    Invalid {
        /// The manifest file.
        path: PathBuf,
        /// What `ltk_game_data` reports.
        message: String,
    },
    /// The manifest's text cannot take the edit. The text is unchanged.
    #[error("{} cannot take the edit: {reason}", path.display())]
    Uneditable {
        /// The manifest file.
        path: PathBuf,
        /// Why.
        reason: Refusal,
    },
    /// A [`ValueText`] that is not one YAML node.
    #[error("invalid value: {0}")]
    InvalidValue(String),
    /// A read or a write failed.
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

/// A layer's declarations manifest, held as text and edited in place.
#[derive(Debug)]
pub struct Manifest {
    /// The manifest file, or the one a write creates.
    path: PathBuf,
    /// The layer's content directory, where source files resolve.
    layer_dir: PathBuf,
    /// The bytes read from disk, `None` where the layer had no manifest.
    read: Option<Vec<u8>>,
    /// The text with every edit applied.
    text: DocumentText,
    ending: LineEnding,
}

impl Manifest {
    /// Read the manifest of the layer whose content directory is `layer_dir`.
    ///
    /// A layer with no manifest reads as an empty text, which a write creates
    /// as [`FILE_NAME`].
    ///
    /// # Errors
    ///
    /// [`Error::NotYaml`] for a layer whose manifest is JSON or TOML,
    /// [`Error::Invalid`] for a layer with more than one manifest or one that
    /// is not UTF-8, and [`Error::Io`] when the file cannot be read.
    pub fn read(layer_dir: impl Into<PathBuf>) -> Result<Self, Error> {
        let layer_dir = layer_dir.into();
        let present: Vec<PathBuf> = MANIFEST_NAMES
            .iter()
            .map(|name| layer_dir.join(name))
            .filter(|path| path.exists())
            .collect();
        let path = match present.as_slice() {
            [] => {
                return Ok(Self {
                    path: layer_dir.join(FILE_NAME),
                    layer_dir,
                    read: None,
                    text: DocumentText::default(),
                    ending: LineEnding::Lf,
                });
            }
            [path] => path.clone(),
            [first, ..] => {
                return Err(Error::Invalid {
                    path: first.clone(),
                    message: "the layer holds more than one game data manifest".to_owned(),
                });
            }
        };
        if !path
            .extension()
            .is_some_and(|extension| extension == "yaml" || extension == "yml")
        {
            return Err(Error::NotYaml { path });
        }

        let bytes = fs::read(&path)?;
        let Ok(text) = std::str::from_utf8(&bytes) else {
            return Err(Error::Invalid {
                path,
                message: "the file is not UTF-8".to_owned(),
            });
        };
        Ok(Self {
            text: DocumentText::new(text.replace("\r\n", "\n")),
            ending: LineEnding::of(&bytes),
            path,
            layer_dir,
            read: Some(bytes),
        })
    }

    /// The manifest file, or the one a write creates.
    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// The text with every edit applied, lines ending in `\n`.
    #[must_use]
    pub fn text(&self) -> &str {
        self.text.as_str()
    }

    /// The declarations the text loads to, `None` for an empty text.
    ///
    /// # Errors
    ///
    /// [`Error::Invalid`] for a text that does not load.
    pub fn declarations(&self) -> Result<Option<Declarations>, Error> {
        self.load(&self.text).map_err(|error| Error::Invalid {
            path: self.path.clone(),
            message: error.to_string(),
        })
    }

    /// Apply one edit to the held text.
    ///
    /// # Errors
    ///
    /// [`Error::Invalid`] for a manifest that does not load before the edit,
    /// and [`Error::Uneditable`] for an edit the text cannot take. Either
    /// leaves the text as it was.
    pub fn edit(&mut self, edit: &Edit) -> Result<(), Error> {
        self.declarations()?;
        let text = self
            .text
            .apply(edit)
            .map_err(|reason| self.uneditable(reason))?;
        if let Err(error) = self.load(&text) {
            return Err(self.uneditable(Refusal::DoesNotLoad(error.to_string())));
        }
        self.text = text;
        Ok(())
    }

    /// Write the held text over the manifest, in the line ending it was read
    /// with.
    ///
    /// # Errors
    ///
    /// [`Error::ChangedOnDisk`] when the file on disk is not the one read,
    /// which writes nothing, and [`Error::Io`] when the write fails.
    pub fn write(&mut self) -> Result<(), Error> {
        let on_disk = match fs::read(&self.path) {
            Ok(bytes) => Some(bytes),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(error.into()),
        };
        if on_disk != self.read {
            return Err(Error::ChangedOnDisk {
                path: self.path.clone(),
            });
        }

        let bytes = self.ending.apply(self.text.as_str()).into_bytes();
        if self.read.as_ref() == Some(&bytes) {
            return Ok(());
        }
        fs::create_dir_all(&self.layer_dir)?;
        let temporary = self.path.with_extension("ltk-tmp");
        fs::write(&temporary, &bytes)?;
        fs::rename(&temporary, &self.path)?;
        self.read = Some(bytes);
        Ok(())
    }

    /// The declarations `text` loads to, its sources read from the layer.
    fn load(&self, text: &DocumentText) -> Result<Option<Declarations>, GameDataError> {
        if text.is_blank() {
            return Ok(None);
        }
        let name = self
            .path
            .file_name()
            .map_or_else(|| FILE_NAME.into(), |name| name.to_string_lossy());
        load_declarations(&name, text.as_str(), |source| {
            read_source(&self.layer_dir, source)
        })
        .map(Some)
    }

    fn uneditable(&self, reason: Refusal) -> Error {
        Error::Uneditable {
            path: self.path.clone(),
            reason,
        }
    }
}

/// A source file a manifest names, read from inside the layer.
fn read_source(layer_dir: &Path, source: &str) -> Result<String, GameDataError> {
    let relative = Path::new(source);
    if relative.is_absolute() || source.contains('\\') {
        return Err(GameDataError::in_document(
            GameDataErrorKind::SourcePathInvalid,
            source,
        ));
    }
    let missing = |error: std::io::Error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            GameDataError::in_document(GameDataErrorKind::InputMissing, source)
        } else {
            GameDataError::io(source, &error)
        }
    };
    let root = fs::canonicalize(layer_dir).map_err(missing)?;
    let resolved = fs::canonicalize(layer_dir.join(relative)).map_err(missing)?;
    if !resolved.starts_with(&root) {
        return Err(GameDataError::in_document(
            GameDataErrorKind::InputEscapes,
            source,
        ));
    }
    fs::read_to_string(resolved).map_err(missing)
}

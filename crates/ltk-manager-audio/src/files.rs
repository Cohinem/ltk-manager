//! The file access of the crate: game paths to bytes, through the caller's store.

use std::io::{self, Read, Seek};

use ltk_manager_assets::preview::AssetRef;

/// A source of bytes that a mounted package reads its media from.
pub trait ReadSeek: Read + Seek + Send {}

impl<T: Read + Seek + Send> ReadSeek for T {}

/// One file that a game path resolves to: its contents and the asset that holds them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AudioFile<T> {
    /// The layer file or game chunk that holds the bytes, for a preview URL of its media.
    pub asset: AssetRef,
    pub contents: T,
}

/// Reads the files of game paths, in the order in which the client reads them.
///
/// The shell implements it over the sandbox: project layer chunks first, then the game index.
pub trait AudioFiles {
    /// Reads the whole file at the game path `path`.
    ///
    /// Returns `Ok(None)` if no layer and no game archive holds the path.
    ///
    /// # Errors
    ///
    /// Fails if the store holds the path and cannot read it.
    fn read(&self, path: &str) -> io::Result<Option<AudioFile<Vec<u8>>>>;

    /// Opens the file at the game path `path` for reads at any offset.
    ///
    /// Returns `Ok(None)` if no layer and no game archive holds the path.
    ///
    /// # Errors
    ///
    /// Fails if the store holds the path and cannot open it.
    fn open(&self, path: &str) -> io::Result<Option<AudioFile<Box<dyn ReadSeek>>>>;
}

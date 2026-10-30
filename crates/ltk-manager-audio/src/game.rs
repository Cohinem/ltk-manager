//! The read of the installed game's archives into an [`AudioIndex`].

use std::io::{self, Cursor, Read, Seek, SeekFrom};

use ltk_manager_assets::game_wads::{
    ArchiveFile, GameArchives, chunk_bytes, chunk_head, mount_wad,
};
use ltk_manager_base::budget::Budget;
use ltk_wad::{ChunkDecoder, WadHash};

use crate::bin_audio::BinAudio;
use crate::index::{AudioIndex, AudioIndexBuilder, media_sources};

/// One named chunk of the installed game.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct GameFile {
    /// The `DATA/FINAL`-relative name of the archive that contains the chunk.
    pub wad: String,
    /// The path hash of the chunk.
    pub path_hash: u64,
    /// The game path of the chunk.
    pub path: String,
}

/// Reads the bins, packages and banks of `files` into an audio index.
///
/// A `.bin` chunk is read whole. A `.wpk` or `.bnk` chunk is read from its first
/// [`HEAD_BYTES`], and whole only if its directory ends after them. Every other chunk is
/// skipped. The archives are read on at most `workers` threads, and `budget` stops the read at
/// the next archive. An archive that does not mount and a chunk that does not read are skipped
/// and logged.
#[must_use]
pub fn read_game(
    archives: &GameArchives,
    files: &[GameFile],
    workers: usize,
    budget: &Budget,
) -> AudioIndex {
    let mut by_wad: Vec<(&str, Vec<&GameFile>)> = Vec::new();
    for file in files.iter().filter(|file| kind_of(&file.path).is_some()) {
        match by_wad.iter_mut().find(|(wad, _)| *wad == file.wad) {
            Some((_, listed)) => listed.push(file),
            None => by_wad.push((&file.wad, vec![file])),
        }
    }

    let read = budget.map(
        &by_wad,
        workers,
        |_| 0,
        |(wad, files)| read_archive(archives, wad, files),
    );

    let mut builder = AudioIndex::builder();
    for part in read.into_iter().flatten() {
        builder.append(part);
    }
    builder.build()
}

/// How many bytes of a package or bank the read decompresses first: room for the directory
/// of nearly every shipped file.
pub const HEAD_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ChunkKind {
    Bin,
    Media,
}

fn kind_of(path: &str) -> Option<ChunkKind> {
    let (_, extension) = path.rsplit_once('.')?;
    if extension.eq_ignore_ascii_case("bin") {
        return Some(ChunkKind::Bin);
    }
    if extension.eq_ignore_ascii_case("wpk") || extension.eq_ignore_ascii_case("bnk") {
        return Some(ChunkKind::Media);
    }
    None
}

fn read_archive(archives: &GameArchives, wad: &str, files: &[&GameFile]) -> AudioIndexBuilder {
    let mut builder = AudioIndexBuilder::default();
    let mut archive = match archives.archive_path(wad).and_then(|path| mount_wad(&path)) {
        Ok(archive) => archive,
        Err(e) => {
            tracing::warn!("The audio index skips game archive {wad}, which does not mount: {e}");
            return builder;
        }
    };

    let mut decoder = ChunkDecoder::new();
    for file in files {
        let read = match kind_of(&file.path) {
            Some(ChunkKind::Bin) => read_bin(&mut archive, file, &mut builder),
            Some(ChunkKind::Media) => read_media(&mut archive, file, &mut decoder, &mut builder),
            None => Ok(()),
        };
        if let Err(message) = read {
            tracing::debug!(wad, path = %file.path, "The audio index skips a chunk: {message}");
        }
    }
    builder
}

fn read_bin(
    archive: &mut ArchiveFile,
    file: &GameFile,
    builder: &mut AudioIndexBuilder,
) -> Result<(), String> {
    let Some(bytes) = chunk_bytes(archive, WadHash(file.path_hash)).map_err(|e| e.to_string())?
    else {
        return Ok(());
    };
    let audio = BinAudio::read(&bytes).map_err(|e| e.to_string())?;
    builder.add_bin(&file.path, audio);
    Ok(())
}

fn read_media(
    archive: &mut ArchiveFile,
    file: &GameFile,
    decoder: &mut ChunkDecoder,
    builder: &mut AudioIndexBuilder,
) -> Result<(), String> {
    let Some(chunk) = archive.chunks().get(WadHash(file.path_hash)).copied() else {
        return Ok(());
    };
    let head = chunk_head(archive, &chunk, decoder, HEAD_BYTES).map_err(|e| e.to_string())?;
    let sources = match media_sources(Head::new(head, chunk.uncompressed_size)) {
        Ok(sources) => sources,
        Err(ltk_wwise::Error::Io(e)) if e.kind() == io::ErrorKind::UnexpectedEof => {
            let whole = archive
                .load_chunk_decompressed(&chunk)
                .map_err(|e| e.to_string())?;
            media_sources(Cursor::new(whole)).map_err(|e| e.to_string())?
        }
        Err(e) => return Err(e.to_string()),
    };
    builder.add_sources(sources);
    Ok(())
}

/// The first bytes of a file of `len` bytes. A read past them ends early.
struct Head {
    bytes: Cursor<Vec<u8>>,
    len: u64,
}

impl Head {
    fn new(bytes: Vec<u8>, len: usize) -> Self {
        Self {
            bytes: Cursor::new(bytes),
            len: len as u64,
        }
    }
}

impl Read for Head {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        self.bytes.read(buf)
    }
}

impl Seek for Head {
    fn seek(&mut self, from: SeekFrom) -> io::Result<u64> {
        match from {
            SeekFrom::End(offset) => self
                .bytes
                .seek(SeekFrom::Start(self.len.saturating_add_signed(offset))),
            other => self.bytes.seek(other),
        }
    }
}

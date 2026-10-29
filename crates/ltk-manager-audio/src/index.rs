//! The audio index: the bank units, event names and media source IDs of the whole game.

use std::collections::HashSet;
use std::io::{Read, Seek, SeekFrom};

use ltk_wwise::{MountedPackage, ObjectId, SourceId};
use serde::{Deserialize, Serialize};

use crate::bank_set::BankUnit;
use crate::bin_audio::BinAudio;
use crate::names::EventNames;

/// One `BankUnit` of the index, with the bin that declares it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IndexedUnit {
    /// The game path of the bin.
    pub bin: String,
    pub unit: BankUnit,
}

/// The bank units, the event names and the media source IDs of a set of bins and audio files.
///
/// The shell builds one over the installed game, once per game build, and one over the bins of
/// an open project.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(from = "Stored", into = "Stored")]
pub struct AudioIndex {
    units: Vec<IndexedUnit>,
    names: EventNames,
    sources: HashSet<SourceId>,
}

impl AudioIndex {
    /// Returns an empty builder.
    #[must_use]
    pub fn builder() -> AudioIndexBuilder {
        AudioIndexBuilder::default()
    }

    /// Returns the bank units whose `bankPath` lists `path`, compared without ASCII case.
    pub fn units_naming<'a>(&'a self, path: &'a str) -> impl Iterator<Item = &'a IndexedUnit> {
        self.units.iter().filter(move |indexed| {
            indexed
                .unit
                .bank_path
                .iter()
                .any(|listed| listed.eq_ignore_ascii_case(path))
        })
    }

    /// Returns the bank units whose `events` lists `event`, compared without ASCII case.
    pub fn units_listing<'a>(&'a self, event: &'a str) -> impl Iterator<Item = &'a IndexedUnit> {
        self.units.iter().filter(move |indexed| {
            indexed
                .unit
                .events
                .iter()
                .any(|listed| listed.eq_ignore_ascii_case(event))
        })
    }

    /// Returns the name of the event `id`, or `None` if no indexed name hashes to it.
    #[must_use]
    pub fn name(&self, id: ObjectId) -> Option<&str> {
        self.names.get(id)
    }

    /// Returns `true` if a package or a media bank of the index holds the media `source`.
    #[must_use]
    pub fn uses_source(&self, source: SourceId) -> bool {
        self.sources.contains(&source)
    }

    /// Returns the bank units of the index, in the order that they were added.
    #[must_use]
    pub fn units(&self) -> &[IndexedUnit] {
        &self.units
    }

    /// Returns the number of event names.
    #[must_use]
    pub fn name_count(&self) -> usize {
        self.names.len()
    }

    /// Returns the number of media source IDs.
    #[must_use]
    pub fn source_count(&self) -> usize {
        self.sources.len()
    }

    /// Writes the index with the key `build`, the game build that it was read from.
    #[must_use]
    pub fn to_bytes(&self, build: &str) -> Vec<u8> {
        let file = IndexFile {
            version: FILE_VERSION,
            build: build.to_owned(),
            index: self.clone(),
        };
        rmp_serde::to_vec(&file).expect("an audio index serializes")
    }

    /// Reads an index that [`AudioIndex::to_bytes`] wrote.
    ///
    /// Returns `None` if the bytes do not parse, or if they were written for another `build` or
    /// by another file version.
    #[must_use]
    pub fn from_bytes(bytes: &[u8], build: &str) -> Option<Self> {
        let file: IndexFile = rmp_serde::from_slice(bytes).ok()?;
        (file.version == FILE_VERSION && file.build == build).then_some(file.index)
    }
}

/// The parts of an [`AudioIndex`] in the making.
#[derive(Debug, Default)]
pub struct AudioIndexBuilder {
    index: AudioIndex,
}

impl AudioIndexBuilder {
    /// Adds the bank units and event names of the bin at the game path `bin`.
    pub fn add_bin(&mut self, bin: &str, audio: BinAudio) {
        self.index.names.extend(&audio.event_names);
        self.index
            .units
            .extend(audio.units.into_iter().map(|unit| IndexedUnit {
                bin: bin.to_owned(),
                unit,
            }));
    }

    /// Adds the media source IDs of one package or media bank.
    pub fn add_sources(&mut self, sources: impl IntoIterator<Item = SourceId>) {
        self.index.sources.extend(sources);
    }

    /// Adds every part of `other` after the parts of this builder.
    pub fn append(&mut self, other: Self) {
        let AudioIndex {
            units,
            names,
            sources,
        } = other.index;
        self.index.units.extend(units);
        self.index.names.extend(names.iter().map(|(_, name)| name));
        self.index.sources.extend(sources);
    }

    /// Returns the index.
    #[must_use]
    pub fn build(self) -> AudioIndex {
        self.index
    }
}

/// Returns the media source IDs of the package or bank in `source`.
///
/// A package reads its entry records. A bank reads the chunk headers up to its `DIDX` and the
/// `DIDX` records, and seeks past every other chunk. Neither reads media bytes. A bank without
/// a `DIDX` holds no media.
///
/// # Errors
///
/// Fails with [`ltk_wwise::Error::InvalidMagic`] if the file is neither, and with the read
/// error of the package or the chunk headers.
pub fn media_sources(mut source: impl Read + Seek) -> Result<Vec<SourceId>, ltk_wwise::Error> {
    let mut magic = [0; 4];
    source.read_exact(&mut magic)?;
    source.seek(SeekFrom::Start(0))?;

    match &magic {
        PACKAGE_MAGIC => {
            let package = MountedPackage::mount(source)?;
            Ok(package
                .entries()
                .iter()
                .filter_map(|entry| u32::try_from(entry.key().0).ok().map(SourceId))
                .collect())
        }
        BANK_MAGIC => bank_sources(source),
        _ => Err(ltk_wwise::Error::InvalidMagic {
            expected: *BANK_MAGIC,
            found: magic,
        }),
    }
}

/// Reads the source IDs of the `DIDX` chunk of a bank.
fn bank_sources(mut source: impl Read + Seek) -> Result<Vec<SourceId>, ltk_wwise::Error> {
    let len = source.seek(SeekFrom::End(0))?;
    let mut at = source.seek(SeekFrom::Start(0))?;
    let mut header = [0; 8];

    while at < len {
        source.read_exact(&mut header)?;
        let (tag, body_len) = header.split_at(4);
        let body_len = u32::from_le_bytes(body_len.try_into().expect("four bytes"));

        if tag != DIDX {
            at = source.seek(SeekFrom::Current(i64::from(body_len)))?;
            continue;
        }

        let mut body = vec![0; body_len as usize];
        source.read_exact(&mut body)?;
        return Ok(body
            .chunks_exact(DIDX_RECORD_LEN)
            .map(|record| {
                SourceId(u32::from_le_bytes(
                    record[..4].try_into().expect("four bytes"),
                ))
            })
            .collect());
    }
    Ok(Vec::new())
}

const PACKAGE_MAGIC: &[u8; 4] = b"r3d2";
const BANK_MAGIC: &[u8; 4] = b"BKHD";
const DIDX: &[u8; 4] = b"DIDX";

/// The length of a `DIDX` record: the source ID, the offset and the size, each a `u32`.
const DIDX_RECORD_LEN: usize = 12;

/// The version of the file that [`AudioIndex::to_bytes`] writes. A file of another version is
/// read as missing.
const FILE_VERSION: u32 = 1;

/// The file that [`AudioIndex::to_bytes`] writes.
#[derive(Serialize, Deserialize)]
struct IndexFile {
    version: u32,
    build: String,
    index: AudioIndex,
}

/// The serialized form of an [`AudioIndex`]: the names as strings, the IDs as numbers.
#[derive(Serialize, Deserialize)]
struct Stored {
    units: Vec<IndexedUnit>,
    names: Vec<String>,
    sources: Vec<u32>,
}

impl From<AudioIndex> for Stored {
    fn from(index: AudioIndex) -> Self {
        let mut sources: Vec<u32> = index.sources.iter().map(|source| source.0).collect();
        sources.sort_unstable();
        Self {
            units: index.units,
            names: index
                .names
                .iter()
                .map(|(_, name)| name.to_owned())
                .collect(),
            sources,
        }
    }
}

impl From<Stored> for AudioIndex {
    fn from(stored: Stored) -> Self {
        Self {
            units: stored.units,
            names: stored.names.iter().collect(),
            sources: stored.sources.into_iter().map(SourceId).collect(),
        }
    }
}

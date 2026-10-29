//! The audio index: the bank units, event names and media source IDs of the whole game.

use std::collections::{HashMap, HashSet};
use std::io::{Read, Seek, SeekFrom};

use ltk_wwise::{MountedPackage, ObjectId, SourceId};
use serde::{Deserialize, Serialize};

use crate::bank_set::BankUnit;
use crate::bin_audio::{BankList, BankSite, BinAudio, ContextualRule, HolderAudio};
use crate::names::EventNames;

/// One `BankUnit` of the index, with the bin that declares it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IndexedUnit {
    /// The game path of the bin.
    pub bin: String,
    /// The unit as written.
    pub unit: BankUnit,
    /// The row of the unit in its bin.
    pub site: BankSite,
    /// The audio fields of the object that declares the unit.
    pub holder: HolderAudio,
}

/// One list of bank paths of the index, with the bin that declares it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IndexedList {
    /// The game path of the bin.
    pub bin: String,
    /// The list as written.
    pub list: BankList,
}

/// The contextual rules of one `ContextualActionData` object, with the bin that declares it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IndexedRules {
    /// The game path of the bin.
    pub bin: String,
    /// The rules of the object, in list order.
    pub rules: Vec<ContextualRule>,
}

/// The bank units, the event names and the media source IDs of a set of bins and audio files.
///
/// The shell builds one over the installed game, once per game build, and one over the bins of
/// an open project.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(from = "Stored")]
pub struct AudioIndex {
    units: Vec<IndexedUnit>,
    lists: Vec<IndexedList>,
    /// The rules by the object's path hash. The first bin that declares an object wins.
    contextual: HashMap<u32, IndexedRules>,
    names: EventNames,
    sources: HashSet<SourceId>,
    /// The positions in `units` of the units that list each lowercased path.
    by_path: HashMap<String, Vec<usize>>,
}

impl AudioIndex {
    /// Returns an empty builder.
    #[must_use]
    pub fn builder() -> AudioIndexBuilder {
        AudioIndexBuilder::default()
    }

    /// Returns the bank units whose `bankPath` lists `path`, compared without ASCII case.
    pub fn units_naming<'a>(
        &'a self,
        path: &str,
    ) -> impl Iterator<Item = &'a IndexedUnit> + use<'a> {
        self.by_path
            .get(&path.to_ascii_lowercase())
            .into_iter()
            .flatten()
            .map(|&at| &self.units[at])
    }

    /// Returns the bank lists that list `path`, compared without ASCII case.
    pub fn lists_naming<'a>(&'a self, path: &'a str) -> impl Iterator<Item = &'a IndexedList> {
        self.lists.iter().filter(move |indexed| {
            indexed
                .list
                .paths
                .iter()
                .any(|listed| listed.eq_ignore_ascii_case(path))
        })
    }

    /// Returns the contextual rules of the `ContextualActionData` object `object`, a path hash.
    #[must_use]
    pub fn contextual(&self, object: u32) -> Option<&IndexedRules> {
        self.contextual.get(&object)
    }

    /// Returns the number of `ContextualActionData` objects.
    #[must_use]
    pub fn contextual_count(&self) -> usize {
        self.contextual.len()
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

    /// Returns `true` if a package or a media bank of the index contains the media `source`.
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
    ///
    /// # Panics
    ///
    /// Panics if `rmp_serde` fails to write the index. Every part of the index is a string, a
    /// number or a sequence of them, so a failure is a bug.
    #[must_use]
    pub fn to_bytes(&self, build: &str) -> Vec<u8> {
        let file = IndexFileRef {
            version: FILE_VERSION,
            build,
            index: self,
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
    /// Adds the audio of the bin at the game path `bin`.
    pub fn add_bin(&mut self, bin: &str, audio: BinAudio) {
        self.index.names.extend(&audio.event_names);
        self.index
            .lists
            .extend(audio.lists.into_iter().map(|list| IndexedList {
                bin: bin.to_owned(),
                list,
            }));
        for rules in audio.contextual {
            self.index
                .contextual
                .entry(rules.object)
                .or_insert_with(|| IndexedRules {
                    bin: bin.to_owned(),
                    rules: rules.rules,
                });
        }
        self.index
            .units
            .extend(audio.units.into_iter().map(|sited| IndexedUnit {
                bin: bin.to_owned(),
                unit: sited.unit,
                site: sited.site,
                holder: sited.holder,
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
            lists,
            contextual,
            names,
            sources,
            by_path: _,
        } = other.index;
        self.index.units.extend(units);
        self.index.lists.extend(lists);
        for (object, rules) in contextual {
            self.index.contextual.entry(object).or_insert(rules);
        }
        self.index.names.extend(names.iter().map(|(_, name)| name));
        self.index.sources.extend(sources);
    }

    /// Returns the index.
    #[must_use]
    pub fn build(mut self) -> AudioIndex {
        self.index.by_path = paths_of(&self.index.units);
        self.index
    }
}

/// Returns the positions of `units` by each lowercased path that they list.
fn paths_of(units: &[IndexedUnit]) -> HashMap<String, Vec<usize>> {
    let mut paths: HashMap<String, Vec<usize>> = HashMap::new();
    for (at, indexed) in units.iter().enumerate() {
        for path in &indexed.unit.bank_path {
            let positions = paths.entry(path.to_ascii_lowercase()).or_default();
            if positions.last() != Some(&at) {
                positions.push(at);
            }
        }
    }
    paths
}

/// Returns the media source IDs of the package or bank in `source`.
///
/// A package reads its entry records. A bank reads the chunk headers up to its `DIDX` and the
/// `DIDX` records, and seeks past every other chunk. Neither reads media bytes. A bank without
/// a `DIDX` contains no media.
///
/// # Errors
///
/// Fails with [`ltk_wwise::Error::InvalidMagic`] if the file is neither, with
/// [`ltk_wwise::Error::ChunkOverrun`] if the `DIDX` chunk ends after the end of the bank, and
/// with the read error of the package or the chunk headers.
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

        /* The length comes from the file, so it is checked against the bytes after the header
        before the buffer is allocated. */
        let remaining = len.saturating_sub(at + CHUNK_HEADER_LEN);
        if u64::from(body_len) > remaining {
            return Err(ltk_wwise::Error::ChunkOverrun {
                tag: *DIDX,
                offset: at,
            });
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

/// The length of a chunk header: the tag and the `u32` length of the body.
const CHUNK_HEADER_LEN: u64 = 8;

/// The length of a `DIDX` record: the source ID, the offset and the size, each a `u32`.
const DIDX_RECORD_LEN: usize = 12;

/// The version of the file that [`AudioIndex::to_bytes`] writes. A file of another version is
/// read as missing.
const FILE_VERSION: u32 = 2;

/// The file that [`AudioIndex::from_bytes`] reads.
#[derive(Deserialize)]
struct IndexFile {
    version: u32,
    build: String,
    index: AudioIndex,
}

/// The file that [`AudioIndex::to_bytes`] writes, with the fields of `IndexFile` borrowed.
#[derive(Serialize)]
struct IndexFileRef<'a> {
    version: u32,
    build: &'a str,
    index: &'a AudioIndex,
}

/// The serialized form of an [`AudioIndex`]: the names as strings, the IDs as numbers.
#[derive(Deserialize)]
struct Stored {
    units: Vec<IndexedUnit>,
    lists: Vec<IndexedList>,
    contextual: Vec<(u32, IndexedRules)>,
    names: Vec<String>,
    sources: Vec<u32>,
}

/// `Stored` with the parts borrowed from the index, in the same field order.
#[derive(Serialize)]
struct StoredRef<'a> {
    units: &'a [IndexedUnit],
    lists: &'a [IndexedList],
    contextual: Vec<(u32, &'a IndexedRules)>,
    names: Vec<&'a str>,
    sources: Vec<u32>,
}

impl<'a> From<&'a AudioIndex> for StoredRef<'a> {
    fn from(index: &'a AudioIndex) -> Self {
        let mut sources: Vec<u32> = index.sources.iter().map(|source| source.0).collect();
        sources.sort_unstable();

        let mut contextual: Vec<(u32, &IndexedRules)> = index
            .contextual
            .iter()
            .map(|(object, rules)| (*object, rules))
            .collect();
        contextual.sort_unstable_by_key(|(object, _)| *object);

        Self {
            units: &index.units,
            lists: &index.lists,
            contextual,
            names: index.names.iter().map(|(_, name)| name).collect(),
            sources,
        }
    }
}

impl Serialize for AudioIndex {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        StoredRef::from(self).serialize(serializer)
    }
}

impl From<Stored> for AudioIndex {
    fn from(stored: Stored) -> Self {
        Self {
            by_path: paths_of(&stored.units),
            units: stored.units,
            lists: stored.lists,
            contextual: stored.contextual.into_iter().collect(),
            names: stored.names.iter().collect(),
            sources: stored.sources.into_iter().map(SourceId).collect(),
        }
    }
}

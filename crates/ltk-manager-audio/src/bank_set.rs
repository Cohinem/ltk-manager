//! The bank set: the files of a list of bank units, opened in the order the client reads them.

use std::collections::HashMap;
use std::collections::hash_map::Entry;
use std::io::Cursor;

use ltk_hash::BinHash;
use ltk_manager_assets::preview::AssetRef;
use ltk_manager_base::hashing::named;
use ltk_wwise::hierarchy::Object;
use ltk_wwise::package::{MountedEntry, PackageKey};
use ltk_wwise::path::{AudioFileKind, AudioPath};
use ltk_wwise::{Bank, MountedPackage, ObjectId, SourceId};

use crate::files::AudioFiles;
use crate::names::EventNames;
use crate::sound::package_key;

/// The class hash of `BankUnit`, the bin class that names the files of one unit of audio.
pub const BANK_UNIT: BinHash = named("BankUnit");

/// The field hash of `bankPath` on [`BANK_UNIT`], the list of those files.
pub const BANK_PATH: BinHash = named("bankPath");

/// One `BankUnit` of a bin, as written.
#[derive(Debug, Clone, Default, PartialEq, Eq, Hash)]
pub struct BankUnit {
    pub name: String,
    /// The `bankPath` list: event banks, media banks and packages.
    pub bank_path: Vec<String>,
    /// The `events` list: the event names that the unit registers.
    pub events: Vec<String>,
    /// The `voiceOver` flag. A voice-over path is read under the client's locale.
    pub voice_over: bool,
}

/// One file of a [`BankSet`].
#[derive(Debug)]
pub struct BankFile {
    path: String,
    unit: usize,
    asset: Option<AssetRef>,
    content: BankContent,
}

impl BankFile {
    /// Returns the game path that the file was read from.
    ///
    /// A voice-over path that a file answers under the client's locale is the localized path.
    #[must_use]
    pub fn path(&self) -> &str {
        &self.path
    }

    /// Returns the index of the bank unit that names the file.
    #[must_use]
    pub fn unit(&self) -> usize {
        self.unit
    }

    /// Returns the layer file or game chunk that holds the file, or `None` for a missing file.
    #[must_use]
    pub fn asset(&self) -> Option<&AssetRef> {
        self.asset.as_ref()
    }

    /// Returns what the file holds.
    #[must_use]
    pub fn content(&self) -> &BankContent {
        &self.content
    }
}

/// What one file of a [`BankSet`] holds.
#[derive(Debug)]
pub enum BankContent {
    /// An event bank or a media bank.
    Bank { bank: Bank },
    /// A package, mounted: the entry records. The media stay in the file.
    Package { entries: Vec<MountedEntry> },
    /// No layer and no game archive holds the path.
    Missing,
    /// The file cannot be read. `message` is the error of the read.
    Failed { message: String },
}

/// The files of a list of bank units, with their objects and media indexed by ID.
///
/// Every index keeps the first match: the first file of the set, then the first object of the
/// file. This is the order of `ltk_wwise::hierarchy::event_sources`.
#[derive(Debug)]
pub struct BankSet {
    units: Vec<BankUnit>,
    files: Vec<BankFile>,
    objects: HashMap<ObjectId, ObjectSite>,
    banked: HashMap<SourceId, usize>,
    packaged: HashMap<PackageKey, usize>,
}

/// The place of a hierarchy object in a [`BankSet`].
#[derive(Debug, Clone, Copy)]
struct ObjectSite {
    file: usize,
    object: usize,
}

impl BankSet {
    /// Opens the files of `units` through `files`.
    ///
    /// A `.wpk` path is mounted as a package, and every other path is read as a bank. A path of a
    /// voice-over unit is read under `locale` first, the client's locale such as `ko_kr`, and
    /// falls back to the path as written. A file that no store holds or that fails to read is
    /// kept in the set, and the other files still open.
    #[must_use]
    pub fn open(units: &[BankUnit], files: &dyn AudioFiles, locale: Option<&str>) -> Self {
        let mut set = Self {
            units: units.to_vec(),
            files: Vec::new(),
            objects: HashMap::new(),
            banked: HashMap::new(),
            packaged: HashMap::new(),
        };

        for (unit_index, unit) in units.iter().enumerate() {
            for path in &unit.bank_path {
                let localized = unit
                    .voice_over
                    .then(|| locale.and_then(|locale| localized(path, locale)))
                    .flatten();
                let file = open_file(files, localized.as_deref(), path, unit_index);
                set.push(file);
            }
        }
        set
    }

    /// Returns the bank units of the set, in the order given to [`BankSet::open`].
    #[must_use]
    pub fn units(&self) -> &[BankUnit] {
        &self.units
    }

    /// Returns the files of the set, in unit order and then in `bankPath` order.
    #[must_use]
    pub fn files(&self) -> &[BankFile] {
        &self.files
    }

    /// Returns the event names that the bank units of the set register.
    #[must_use]
    pub fn event_names(&self) -> EventNames {
        let mut names = EventNames::new();
        names.extend(self.units.iter().flat_map(|unit| &unit.events));
        names
    }

    /// Returns the first hierarchy object `id` of the set, with the index of its file.
    pub(crate) fn object(&self, id: ObjectId) -> Option<(usize, &Bank, &Object)> {
        let site = self.objects.get(&id)?;
        let BankContent::Bank { bank } = &self.files[site.file].content else {
            return None;
        };
        let object = bank.hierarchy()?.objects().get(site.object)?;
        Some((site.file, bank, object))
    }

    /// Returns the index of the first file whose media index holds `source`.
    pub(crate) fn bank_with_media(&self, source: SourceId) -> Option<usize> {
        self.banked.get(&source).copied()
    }

    /// Returns the index of the first package that holds the media `source`.
    pub(crate) fn package_with_media(&self, source: SourceId) -> Option<usize> {
        self.packaged.get(&package_key(source)).copied()
    }

    fn push(&mut self, file: BankFile) {
        let index = self.files.len();
        match &file.content {
            BankContent::Bank { bank } => {
                if let Some(hierarchy) = bank.hierarchy() {
                    for (object, each) in hierarchy.objects().iter().enumerate() {
                        if let Entry::Vacant(slot) = self.objects.entry(each.id()) {
                            slot.insert(ObjectSite {
                                file: index,
                                object,
                            });
                        }
                    }
                }

                if let Some(media) = bank.media() {
                    for (source, _) in media.iter() {
                        self.banked.entry(source).or_insert(index);
                    }
                }
            }
            BankContent::Package { entries } => {
                for entry in entries {
                    self.packaged.entry(entry.key()).or_insert(index);
                }
            }
            BankContent::Missing | BankContent::Failed { .. } => {}
        }

        self.files.push(file);
    }
}

/// Opens `path`, or `localized` first if it is given and a store holds it.
fn open_file(files: &dyn AudioFiles, localized: Option<&str>, path: &str, unit: usize) -> BankFile {
    let file = |path: &str, asset, content| BankFile {
        path: path.to_owned(),
        unit,
        asset,
        content,
    };
    let failed =
        |path: &str, asset, message: String| file(path, asset, BankContent::Failed { message });

    for candidate in localized.into_iter().chain([path]) {
        match AudioPath::new(candidate).kind() {
            AudioFileKind::Package => match files.open(candidate) {
                Ok(Some(opened)) => {
                    return match MountedPackage::mount(opened.contents) {
                        Ok(package) => file(
                            candidate,
                            Some(opened.asset),
                            BankContent::Package {
                                entries: package.entries().to_vec(),
                            },
                        ),
                        Err(e) => failed(candidate, Some(opened.asset), e.to_string()),
                    };
                }
                Ok(None) => {}
                Err(e) => return failed(candidate, None, e.to_string()),
            },
            AudioFileKind::Bank => match files.read(candidate) {
                Ok(Some(opened)) => {
                    return match Bank::from_reader(&mut Cursor::new(opened.contents)) {
                        Ok(bank) => file(candidate, Some(opened.asset), BankContent::Bank { bank }),
                        Err(e) => failed(candidate, Some(opened.asset), e.to_string()),
                    };
                }
                Ok(None) => {}
                Err(e) => return failed(candidate, None, e.to_string()),
            },
        }
    }

    file(path, None, BankContent::Missing)
}

/// Returns `path` with each `en_US` segment replaced by `locale`, or `None` if nothing changes.
///
/// `locale` is written as `ll_RR`, the spelling of the shipped paths.
fn localized(path: &str, locale: &str) -> Option<String> {
    let (language, region) = locale.split_once('_')?;
    let locale = format!(
        "{}_{}",
        language.to_ascii_lowercase(),
        region.to_ascii_uppercase()
    );
    if locale.eq_ignore_ascii_case(SHIPPED_LOCALE) {
        return None;
    }

    let mut changed = false;
    let segments: Vec<&str> = path
        .split('/')
        .map(|segment| {
            if segment.eq_ignore_ascii_case(SHIPPED_LOCALE) {
                changed = true;
                locale.as_str()
            } else {
                segment
            }
        })
        .collect();

    changed.then(|| segments.join("/"))
}

/// The locale segment that every shipped voice-over path spells.
const SHIPPED_LOCALE: &str = "en_US";

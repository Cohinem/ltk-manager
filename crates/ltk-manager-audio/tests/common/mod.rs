//! Shared helpers of the `ltk-manager-audio` integration tests.

#![expect(dead_code, reason = "each test binary uses a different subset")]

use std::collections::{HashMap, HashSet};
use std::io::{self, Cursor};
use std::path::Path;

use ltk_manager_assets::preview::AssetRef;
use ltk_manager_audio::{AudioFile, AudioFiles, ReadSeek, SiteNames};
use ltk_wwise::{Bank, Package, SourceId};

/// Returns the bytes of the fixture `name` in `tests/fixtures`.
pub fn fixture(name: &str) -> Vec<u8> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(name);
    fs_err::read(&path).unwrap_or_else(|e| panic!("read fixture {}: {e}", path.display()))
}

/// Reads the fixture `name` as a bank.
pub fn bank(name: &str) -> Bank {
    Bank::from_reader(&mut &fixture(name)[..]).expect("read bank")
}

/// Returns the media `source` of the package fixture.
pub fn packaged(source: u32) -> Vec<u8> {
    Package::from_reader(&mut &fixture("package.wpk")[..])
        .expect("read package")
        .wem(SourceId(source))
        .unwrap_or_else(|| panic!("package has no media {source}"))
        .to_vec()
}

/// The source IDs of the package fixture, in entry order.
pub fn packaged_sources() -> Vec<SourceId> {
    Package::from_reader(&mut &fixture("package.wpk")[..])
        .expect("read package")
        .entries()
        .iter()
        .map(|entry| SourceId(entry.key().0 as u32))
        .collect()
}

/// Files by game path, in memory. A path is found case-insensitively.
#[derive(Debug, Default)]
pub struct FakeFiles {
    files: HashMap<String, Vec<u8>>,
    failing: HashSet<String>,
}

impl FakeFiles {
    /// Adds `bytes` at the game path `path`.
    pub fn with(mut self, path: &str, bytes: Vec<u8>) -> Self {
        self.files.insert(path.to_lowercase(), bytes);
        self
    }

    /// Adds the fixture `name` at the game path `path`.
    pub fn with_fixture(self, path: &str, name: &str) -> Self {
        self.with(path, fixture(name))
    }

    /// Makes a read of the game path `path` fail with an I/O error.
    pub fn failing(mut self, path: &str) -> Self {
        self.failing.insert(path.to_lowercase());
        self
    }

    fn check(&self, path: &str) -> io::Result<()> {
        if self.failing.contains(&path.to_lowercase()) {
            return Err(io::Error::other(format!("failed to read {path}")));
        }
        Ok(())
    }

    fn asset(path: &str) -> AssetRef {
        AssetRef::File {
            path: path.to_lowercase(),
        }
    }
}

impl AudioFiles for FakeFiles {
    fn read(&self, path: &str) -> io::Result<Option<AudioFile<Vec<u8>>>> {
        self.check(path)?;
        Ok(self.files.get(&path.to_lowercase()).map(|bytes| AudioFile {
            asset: Self::asset(path),
            contents: bytes.clone(),
        }))
    }

    fn open(&self, path: &str) -> io::Result<Option<AudioFile<Box<dyn ReadSeek>>>> {
        self.check(path)?;
        Ok(self.files.get(&path.to_lowercase()).map(|bytes| AudioFile {
            asset: Self::asset(path),
            contents: Box::new(Cursor::new(bytes.clone())) as Box<dyn ReadSeek>,
        }))
    }
}

/// Site names from in-memory tables. A located path is a loose file at that path.
#[derive(Debug, Default)]
pub struct FakeNames {
    assets: HashSet<String>,
    fields: HashMap<u32, String>,
    hashes: HashMap<u32, String>,
}

impl FakeNames {
    /// Locates the game path `path`.
    pub fn with_asset(mut self, path: &str) -> Self {
        self.assets.insert(path.to_lowercase());
        self
    }

    /// Names the field `hash`.
    pub fn with_field(mut self, hash: u32, name: &str) -> Self {
        self.fields.insert(hash, name.to_owned());
        self
    }

    /// Names the hash value `hash`.
    pub fn with_hash(mut self, hash: u32, name: &str) -> Self {
        self.hashes.insert(hash, name.to_owned());
        self
    }
}

impl SiteNames for FakeNames {
    fn locate(&self, path: &str) -> Option<AssetRef> {
        let path = path.to_lowercase();
        self.assets
            .contains(&path)
            .then_some(AssetRef::File { path })
    }

    fn object_name(&self, _hash: u32) -> Option<String> {
        None
    }

    fn class_name(&self, _hash: u32) -> Option<String> {
        None
    }

    fn field_name(&self, hash: u32) -> Option<String> {
        self.fields.get(&hash).cloned()
    }

    fn hash_name(&self, hash: u32) -> Option<String> {
        self.hashes.get(&hash).cloned()
    }
}

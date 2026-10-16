//! `bin/base-skin-copy` - a skin bin that is a copy of the base skin.
//!
//! Detects a byte copy of `skin0.bin` and a copy with the skin objects renamed
//! to skin N, the shape of the Base skins stand-in in ADR-0043. The repair
//! removes the file.

use ltk_hash::BinHash;
use ltk_meta::walk::Node;
use ltk_meta::{BinFile, BinObject, PropertyValueEnum};
use ltk_wad::WadHash;

use crate::engine::parse_bin;
use crate::{
    Applied, Detail, FileHandle, FixError, FixPreview, FixRun, ObjectRead, Pass, Problem,
    ProblemSeverity, ProjectFiles, Rule, RuleId, RuleMeta, Site, Weight,
};
use ltk_manager_bin::bin_walk::Declared;

/// The id every row of this rule carries.
pub const ID: RuleId = RuleId("bin/base-skin-copy");

/// The deep link of the Base skins setting, `builtins.baseSkins` in the settings index.
const BASE_SKINS_SETTING: &str = "ltk://settings?focus=builtins.baseSkins";

/// Reports a skin bin that is a copy of the base skin.
#[derive(Debug, Default)]
pub struct BinBaseSkinCopy;

impl BinBaseSkinCopy {
    #[must_use]
    pub fn new() -> Self {
        Self
    }
}

/// The rule as the catalogue lists it.
const META: RuleMeta = RuleMeta {
    id: ID,
    title: "Copied base skin",
    description: "A skin bin that is a copy of the base skin",
    unfixable: "",
    severity: Some(ProblemSeverity::Warning),
};

impl Rule for BinBaseSkinCopy {
    fn meta(&self) -> &RuleMeta {
        &META
    }

    fn link(&self) -> Option<&'static str> {
        Some(BASE_SKINS_SETTING)
    }

    fn subscribe(&self, pass: &mut Pass<'_>) {
        let project = pass.project();
        let copies = pass
            .bins()
            /* Each skin bin is parsed with its base skin. */
            .weighing(Weight::Bins(2))
            .collect(Copies { project });
        pass.finish(move |finish| {
            for (handle, copied) in finish.take(copies) {
                if !copied {
                    continue;
                }
                finish.problem(
                    ProblemSeverity::Warning,
                    Site::file(handle.layer(), handle.path()),
                    Detail {
                        mismatch: None,
                        message: None,
                        fix: Some(FixPreview::note("Removed")),
                    },
                );
            }
        });
    }

    fn fix(&self, problems: &[&Problem], run: &mut FixRun<'_>) -> Result<Applied, FixError> {
        run.per_file(problems, |run, layer, path| {
            // A file that is missing or changed since the check is skipped.
            let copied = match run.project() {
                Ok(project) => project
                    .file(layer, path)
                    .is_some_and(|handle| copies_base(project, handle).unwrap_or(false)),
                Err(_) => false,
            };
            if !copied {
                return Ok(false);
            }

            run.remove(layer, path, 1)?;
            Ok(true)
        })
    }
}

/// The reader that compares each skin bin of a project with its base skin.
struct Copies<'p> {
    project: &'p ProjectFiles,
}

impl ObjectRead for Copies<'_> {
    /// `true` if the bin is a copy of its base skin.
    type Kept = bool;

    fn object<'a, V: Declared<'a>>(
        &self,
        _: &Node<'_, 'a, V>,
        _: &mut bool,
    ) -> Result<(), ltk_meta::Error> {
        Ok(())
    }

    /// Returns whether `handle` is a copy of its base skin.
    ///
    /// # Errors
    ///
    /// Fails if either bin does not read or parse.
    fn end(&self, handle: FileHandle<'_>, _: bool) -> Result<bool, String> {
        copies_base(self.project, handle)
    }
}

/// Returns whether `handle` is a skin bin past skin 0 and a copy of its base skin.
///
/// The base skin is the `skin0.bin` in the same layer, or the game's if the layer has
/// none. Returns `false` if neither exists.
///
/// # Errors
///
/// Fails if either bin does not read or parse.
fn copies_base(project: &ProjectFiles, handle: FileHandle<'_>) -> Result<bool, String> {
    let Some(skin) = SkinBin::of(&handle) else {
        return Ok(false);
    };
    if skin.id == 0 {
        return Ok(false);
    }

    let base_hash = WadHash::from(skin.chunk_path(0).as_str());
    let base_bytes = match project
        .files()
        .find(|other| other.layer() == handle.layer() && other.wad_hash() == Some(base_hash))
    {
        Some(base) => Some(base.bytes()?),
        None => project
            .game()
            .map(|game| game.read(base_hash))
            .transpose()?
            .flatten(),
    };
    let Some(base_bytes) = base_bytes else {
        return Ok(false);
    };

    let ours = parse_bin(&handle.bytes()?)?;
    let base = parse_bin(&base_bytes)?;
    Ok(skin.copies(&ours, &base))
}

/// `data/characters/<character>/skins/skin<id>.bin`, the character lowercased.
#[derive(Debug, Clone, PartialEq, Eq)]
struct SkinBin {
    character: String,
    id: u32,
}

impl SkinBin {
    /// Returns the skin bin that `handle` is, or `None` if its chunk path is not one.
    ///
    /// Returns `None` for a file outside a WAD, and for a chunk that no hash table named.
    fn of(handle: &FileHandle<'_>) -> Option<Self> {
        handle.wad_hash()?;
        let (_, chunk) = handle.path().split_once('/')?;
        Self::parse(chunk)
    }

    /// Returns the skin bin at the chunk path `path`, or `None` if it is not one.
    fn parse(path: &str) -> Option<Self> {
        let path = path.to_ascii_lowercase();
        let (character, file) = path
            .strip_prefix("data/characters/")?
            .split_once("/skins/")?;
        let id = file.strip_prefix("skin")?.strip_suffix(".bin")?;
        let canonical = !id.is_empty()
            && id.bytes().all(|b| b.is_ascii_digit())
            && (id == "0" || !id.starts_with('0'));
        if character.is_empty() || character.contains('/') || !canonical {
            return None;
        }

        Some(Self {
            character: character.to_owned(),
            id: id.parse().ok()?,
        })
    }

    fn chunk_path(&self, id: u32) -> String {
        format!("data/characters/{}/skins/skin{id}.bin", self.character)
    }

    /// `Characters/<character>/Skins/Skin<id><suffix>`.
    fn object(&self, id: u32, suffix: &str) -> BinHash {
        BinHash::from(format!("Characters/{}/Skins/Skin{id}{suffix}", self.character).as_str())
    }

    /// Returns whether every object of `ours` equals the object of `base` with the same
    /// skin 0 name, and `ours` contains the skin object.
    fn copies(&self, ours: &BinFile, base: &BinFile) -> bool {
        let renamed = [
            (self.object(self.id, ""), self.object(0, "")),
            (self.object(self.id, RESOURCES), self.object(0, RESOURCES)),
        ];
        let as_base = |hash: BinHash| {
            renamed
                .iter()
                .find(|(from, _)| *from == hash)
                .map_or(hash, |(_, to)| *to)
        };

        let mut holds_skin = false;
        for object in ours.objects().values() {
            let object = renamed_object(object, as_base);
            if object.path_hash == self.object(0, "") {
                holds_skin = true;
            }
            if base.objects().get(&object.path_hash) != Some(&object) {
                return false;
            }
        }
        holds_skin
    }
}

const RESOURCES: &str = "/Resources";

/// Returns `object` with its path hash and its top-level object links mapped through `rename`.
fn renamed_object(object: &BinObject, rename: impl Fn(BinHash) -> BinHash) -> BinObject {
    let mut object = object.clone();
    object.path_hash = rename(object.path_hash);
    for value in object.properties.values_mut() {
        if let PropertyValueEnum::ObjectLink(link) = value {
            link.value = rename(link.value);
        }
    }
    object
}

#[cfg(test)]
mod tests;

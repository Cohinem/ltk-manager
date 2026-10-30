//! `bin/skinhack` - a base skin that uses the mesh or the name of another skin.
//!
//! Mirrors the base-skin check of the patcher's anti-skinhack scan, which blocks the
//! champion WAD. The other skins' meshes are read from the installed game.
//!
//! The repair removes the audio of another skin, and only where every hit is audio. It never
//! copies or renames the banks of another skin, per "The skinhack rule" in
//! `docs/ux/PROJECT_PROBLEMS.md`.

mod repair;

use std::collections::{HashSet, VecDeque};

use ltk_hash::BinHash;
use ltk_meta::property::values::{Container, Struct};
use ltk_meta::walk::Node;
use ltk_meta::{BinObject, PropertyValueEnum};
use ltk_wad::WadHash;
use sha2::{Digest, Sha256};

use crate::bank_units::BankUnits;
use crate::engine::parse_bin;
use crate::game::GameContent;
use crate::{
    Applied, Detail, FileHandle, FixError, FixPreview, FixRun, ObjectRead, Pass, Problem,
    ProblemSeverity, ProjectFiles, Rule, RuleId, RuleMeta, Site, Weight,
};
use ltk_manager_base::hashing::named;
use ltk_manager_bin::bin_walk::Declared;
use repair::Refusal;

/// The id every row of this rule carries.
pub const ID: RuleId = RuleId("bin/skinhack");

/// The highest skin number probed for. Each probe is one table-of-contents lookup.
const MAX_SKIN: u32 = 999;

/// The most bins that a skin object is looked up in, following linked bins.
const MAX_LINKED_BINS: usize = 64;

/// Reports a base skin that uses the mesh or the name of another skin.
#[derive(Debug, Default)]
pub struct BinSkinhack;

impl BinSkinhack {
    #[must_use]
    pub fn new() -> Self {
        Self
    }
}

/// The rule as the catalogue lists it.
const META: RuleMeta = RuleMeta {
    id: ID,
    title: "Skinhack",
    description: "A base skin that uses the mesh or the name of another skin of its champion",
    unfixable: "Couldn't repair because the base skin is built from another skin",
    severity: Some(ProblemSeverity::Error),
};

impl Rule for BinSkinhack {
    fn meta(&self) -> &RuleMeta {
        &META
    }

    fn subscribe(&self, pass: &mut Pass<'_>) {
        let project = pass.project();
        let found = pass
            .bins()
            /* The base skin is parsed with the game's, then with each other skin's bin. */
            .weighing(Weight::Bins(2))
            .collect(Skinhacks { project });
        pass.finish(move |finish| {
            for (handle, finding) in finish.take(found) {
                let Some(finding) = finding else {
                    continue;
                };
                finish.problem(
                    ProblemSeverity::Error,
                    Site::file(handle.layer(), handle.path()),
                    finding.detail(),
                );
            }
        });
    }

    /// Removes the audio of another skin from each base skin whose every hit is audio.
    ///
    /// Derives the repair again from the file and skips the file if its preview differs from
    /// the check's. Skips the file if the repaired bin would still be reported.
    fn fix(&self, problems: &[&Problem], run: &mut FixRun<'_>) -> Result<Applied, FixError> {
        let mut applied = Applied::default();

        for problem in problems {
            let (layer, path) = (&problem.site.layer, &problem.site.path);
            let prepared = match prepare(run, problem) {
                Ok(prepared) => prepared,
                Err(refusal) => {
                    tracing::info!("Skipped the skinhack repair of {layer}/{path}: {refusal}");
                    run.skipped(layer, path, 1);
                    applied.skipped += 1;
                    continue;
                }
            };

            let mut counted = 1;
            for (written, bytes) in &prepared.writes {
                run.write(layer, written, bytes, counted, 0)?;
                counted = 0;
            }

            if !prepared.banks.is_empty() {
                let units = run.fact::<BankUnits>().unwrap_or_default();
                for (bank, hash) in &prepared.banks {
                    if !units.asks_for(*hash) {
                        run.remove(layer, bank, 0)?;
                    }
                }
            }

            applied.applied += 1;
        }

        Ok(applied)
    }
}

/// The writes and removals of one repair, derived and verified before any of them lands.
struct Prepared {
    /// Each bin of the layer to write, `skin0.bin` first.
    writes: Vec<(String, Vec<u8>)>,
    /// Each bank file that the layer ships for a removed unit, with its chunk hash.
    banks: Vec<(String, WadHash)>,
}

/// Derives the repair of `problem` again from the mod as `run` has left it.
///
/// # Errors
///
/// Returns the refusal if the bin changed since the check, if it no longer reads, if the repair
/// is refused, or if the repaired bin would still be reported.
fn prepare(run: &FixRun<'_>, problem: &Problem) -> Result<Prepared, Refusal> {
    let project = run
        .project()
        .map_err(|error| Refusal::Unreadable(error.to_string()))?;
    let handle = project
        .file(&problem.site.layer, &problem.site.path)
        .ok_or(Refusal::Changed)?;

    let evidence = skinhack(project, &handle).map_err(Refusal::Unreadable)?;
    if !is_audio_only(&evidence) {
        return Err(Refusal::Changed);
    }

    let plan = repair::plan(project, &handle)?;
    if problem.fix.as_ref() != Some(&plan.preview()) {
        return Err(Refusal::Changed);
    }

    let writes = plan.encoded().map_err(Refusal::Unreadable)?;
    let Some((_, repaired)) = writes.first() else {
        return Err(Refusal::Changed);
    };
    if !evidence_in(project, &handle, repaired)
        .map_err(Refusal::Unreadable)?
        .is_empty()
    {
        return Err(Refusal::StillReported);
    }

    let banks = plan
        .dropped()
        .iter()
        .filter_map(|bank| {
            let hash = WadHash::from(bank.as_str());
            shipped(project, handle.layer(), hash).map(|file| (file.path().to_owned(), hash))
        })
        .collect();

    Ok(Prepared { writes, banks })
}

/// The reader that checks each base skin of a project.
struct Skinhacks<'p> {
    project: &'p ProjectFiles,
}

impl ObjectRead for Skinhacks<'_> {
    /// Why the bin is a skinhack, or `None` if it is not one.
    type Kept = Option<Finding>;

    fn object<'a, V: Declared<'a>>(
        &self,
        _: &Node<'_, 'a, V>,
        _: &mut Option<Finding>,
    ) -> Result<(), ltk_meta::Error> {
        Ok(())
    }

    /// Returns why `handle` is a skinhack, and the repair if every hit is audio.
    ///
    /// # Errors
    ///
    /// Fails if a bin of the mod does not read or parse.
    fn end(&self, handle: FileHandle<'_>, _: Option<Finding>) -> Result<Option<Finding>, String> {
        let evidence = skinhack(self.project, &handle)?;
        if evidence.is_empty() {
            return Ok(None);
        }

        let repair = is_audio_only(&evidence)
            .then(|| repair::plan(self.project, &handle).map(|plan| plan.preview()));
        Ok(Some(Finding { evidence, repair }))
    }
}

/// What one base skin is reported with.
#[derive(Debug, Default)]
struct Finding {
    /// Every hit, never empty.
    evidence: Vec<Evidence>,
    /// The preview of the repair, or why it is refused. `None` if a hit is not audio.
    repair: Option<Result<FixPreview, Refusal>>,
}

impl Finding {
    fn detail(self) -> Detail {
        let mut message = self
            .evidence
            .iter()
            .map(Evidence::message)
            .collect::<Vec<_>>()
            .join(". ");

        let fix = match self.repair {
            Some(Ok(preview)) => Some(preview),
            Some(Err(refusal @ Refusal::BaseAudioMissing)) => {
                message.push_str(&format!(". {refusal}"));
                None
            }
            Some(Err(_)) | None => None,
        };

        Detail {
            mismatch: None,
            message: Some(message),
            fix,
            alternatives: Vec::new(),
        }
    }
}

/// Returns `true` if the only hit of `evidence` is in the audio properties.
fn is_audio_only(evidence: &[Evidence]) -> bool {
    matches!(evidence, [Evidence::Audio { .. }])
}

/// A mesh property of `SkinMeshProperties` that the patcher compares.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Slot {
    Skeleton,
    SimpleSkin,
}

impl Slot {
    const ALL: [Self; 2] = [Self::Skeleton, Self::SimpleSkin];

    fn field(self) -> &'static str {
        match self {
            Self::Skeleton => "Skeleton",
            Self::SimpleSkin => "SimpleSkin",
        }
    }
}

/// What makes a base skin a skinhack.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Evidence {
    /// The content of `slot` is the mesh of the same slot of skin `skin`.
    Mesh { slot: Slot, skin: u32 },
    /// `ChampionSkinName` is `value`, which names another skin.
    Name { value: String },
    /// The entries of `SkinAudioProperties` that name another skin.
    Audio {
        /// The `TagEventList` entries.
        tags: Vec<String>,
        /// The `BankUnits` entries, by `Name`.
        units: Vec<String>,
    },
}

impl Evidence {
    fn message(&self) -> String {
        match self {
            Self::Mesh { slot, skin } => {
                format!(
                    "SkinMeshProperties.{} is the mesh of skin {skin}",
                    slot.field()
                )
            }
            Self::Name { value } => format!("ChampionSkinName names another skin: {value}"),
            Self::Audio { tags, units } => {
                let mut lines = Vec::new();
                if !tags.is_empty() {
                    lines.push(format!(
                        "SkinAudioProperties.TagEventList names another skin: {}",
                        tags.join(", ")
                    ));
                }
                if !units.is_empty() {
                    lines.push(format!(
                        "SkinAudioProperties.BankUnits.Name names another skin: {}",
                        units.join(", ")
                    ));
                }
                lines.join(". ")
            }
        }
    }
}

/// The markers of another skin of one champion, lowercase.
#[derive(Debug, Clone)]
struct Markers {
    /// `<champion>skin`, which a skin name and an audio tag contain.
    name: String,
    /// `<champion>_skin`, which the name of an SFX bank unit contains.
    bank: String,
}

impl Markers {
    fn of(champion: &str) -> Self {
        Self {
            name: format!("{champion}skin"),
            bank: format!("{champion}_skin"),
        }
    }

    /// Returns `true` if the skin name, tag or event name `value` names another skin.
    fn names(&self, value: &str) -> bool {
        names_other_skin(value, &self.name, "")
    }

    /// Returns `true` if the bank unit name `value` names the SFX of another skin.
    fn names_unit(&self, value: &str) -> bool {
        names_other_skin(value, &self.bank, "_sfx")
    }
}

/// One mesh of a skin past skin 0.
struct OtherMesh {
    skin: u32,
    slot: Slot,
    path: String,
}

/// Returns why `handle` is a skinhack, or no evidence if it is not one.
///
/// Returns no evidence for a bin other than `data/characters/<c>/skins/skin0.bin` inside
/// `<c>.wad.client`, and if the project has no game, without reading the bin.
///
/// # Errors
///
/// Fails if a bin of the mod does not read or parse, or if a mesh does not read.
fn skinhack(project: &ProjectFiles, handle: &FileHandle<'_>) -> Result<Vec<Evidence>, String> {
    if champion_of(handle).is_none() || project.game().is_none() {
        return Ok(Vec::new());
    }

    evidence_in(project, handle, &handle.bytes()?)
}

/// Returns why `handle` is a skinhack if its bytes are `bytes`, or no evidence if it is not one.
///
/// A base skin passes if either mesh has the content of the game's base skin. It fails if a
/// mesh has the content of another skin's mesh, or if a name field names another skin. A mesh
/// hit is the only evidence returned, and every name hit is returned otherwise. Returns no
/// evidence for a bin other than `data/characters/<c>/skins/skin0.bin` inside
/// `<c>.wad.client`, if the project has no game, and if a mesh is missing.
///
/// # Errors
///
/// Fails if a bin of the mod does not read or parse, or if a mesh does not read.
fn evidence_in(
    project: &ProjectFiles,
    handle: &FileHandle<'_>,
    bytes: &[u8],
) -> Result<Vec<Evidence>, String> {
    let Some(champion) = champion_of(handle) else {
        return Ok(Vec::new());
    };
    let Some(game) = project.game() else {
        return Ok(Vec::new());
    };

    let root = skin_bin(&champion, 0);
    let root_hash = WadHash::from(root.as_str());
    let entry = skin_object(&champion, 0);
    let Some(base_bytes) = game.read(root_hash)? else {
        return Ok(Vec::new());
    };
    if bytes == base_bytes {
        return Ok(Vec::new());
    }

    let layer = handle.layer();
    let mut read_ours = |path: &str| {
        if WadHash::from(path) == root_hash {
            return Ok(Some(bytes.to_vec()));
        }
        read_merged(project, layer, game, path)
    };
    let Some(ours) = resolve_skin(&mut read_ours, &root, entry)? else {
        return Ok(Vec::new());
    };
    let Ok(Some(base)) = resolve_skin(&mut |path| game.read(WadHash::from(path)), &root, entry)
    else {
        return Ok(Vec::new());
    };

    let mut modified = Vec::new();
    for slot in Slot::ALL {
        let Some(path) = mesh_path(&ours, slot) else {
            return Ok(Vec::new());
        };
        let Some((size, digest)) = merged_digest(project, layer, game, path)? else {
            return Ok(Vec::new());
        };

        let base_digest = match mesh_path(&base, slot) {
            Some(base_path) => game.digest(WadHash::from(base_path))?,
            None => None,
        };
        if base_digest == Some(digest) {
            return Ok(Vec::new());
        }
        modified.push((slot, size, digest));
    }

    let others = other_skin_meshes(game, &champion);
    for (slot, size, digest) in modified {
        for other in others.iter().filter(|other| other.slot == slot) {
            let hash = WadHash::from(other.path.as_str());
            /* The size is in the table of contents, so most meshes are never read. */
            if game.size(hash) != Some(size) {
                continue;
            }
            if game.digest(hash)? == Some(digest) {
                return Ok(vec![Evidence::Mesh {
                    slot,
                    skin: other.skin,
                }]);
            }
        }
    }

    Ok(other_skin_names(&ours, &Markers::of(&champion)))
}

/// Returns the lowercase champion of the base skin `handle`, or `None` if `handle` is not
/// `data/characters/<c>/skins/skin0.bin` inside `<c>.wad.client`.
fn champion_of(handle: &FileHandle<'_>) -> Option<String> {
    handle.wad_hash()?;
    let path = handle.path().to_ascii_lowercase();
    let (wad, chunk) = path.split_once('/')?;
    let champion = chunk
        .strip_prefix("data/characters/")?
        .strip_suffix("/skins/skin0.bin")?;

    let in_own_wad = wad.strip_suffix(".wad.client") == Some(champion);
    (!champion.is_empty() && !champion.contains('/') && in_own_wad).then(|| champion.to_owned())
}

fn skin_bin(champion: &str, skin: u32) -> String {
    format!("data/characters/{champion}/skins/skin{skin}.bin")
}

/// `Characters/<champion>/Skins/Skin<skin>`, the skin object.
fn skin_object(champion: &str, skin: u32) -> BinHash {
    BinHash::from(format!("Characters/{champion}/Skins/Skin{skin}").as_str())
}

/// A reader of a bin by its path, which returns `None` if no archive contains it.
type ReadBin<'r> = dyn FnMut(&str) -> Result<Option<Vec<u8>>, String> + 'r;

/// Returns the skin object `entry`, looked up in `root` and then in its linked bins,
/// breadth-first, the way the game resolves it.
///
/// Returns `None` if no bin declares the object, if the declaration has another class, or if
/// the lookup passes `MAX_LINKED_BINS` bins.
///
/// # Errors
///
/// Fails if a bin does not read or parse.
fn resolve_skin(
    read: &mut ReadBin<'_>,
    root: &str,
    entry: BinHash,
) -> Result<Option<BinObject>, String> {
    let mut queue = VecDeque::from([root.to_owned()]);
    let mut visited = HashSet::new();

    while let Some(path) = queue.pop_front() {
        if !visited.insert(WadHash::from(path.as_str())) {
            continue;
        }
        if visited.len() > MAX_LINKED_BINS {
            return Ok(None);
        }

        let Some(bytes) = read(&path)? else {
            continue;
        };
        let bin = parse_bin(&bytes)?;
        if let Some(object) = bin.objects().get(&entry) {
            let is_skin = object.class_hash == named("SkinCharacterDataProperties");
            return Ok(is_skin.then(|| object.clone()));
        }

        if let Some(prop) = bin.as_prop() {
            queue.extend(prop.dependencies.iter().cloned());
        }
    }

    Ok(None)
}

/// Returns the meshes of every skin of `champion` past skin 0 that the game installs.
///
/// Skips a skin whose bins do not read or parse.
fn other_skin_meshes(game: &dyn GameContent, champion: &str) -> Vec<OtherMesh> {
    let mut meshes = Vec::new();

    for skin in 1..=MAX_SKIN {
        let root = skin_bin(champion, skin);
        if !game.contains(WadHash::from(root.as_str())) {
            continue;
        }

        let resolved = resolve_skin(
            &mut |path| game.read(WadHash::from(path)),
            &root,
            skin_object(champion, skin),
        );
        let object = match resolved {
            Ok(Some(object)) => object,
            Ok(None) => continue,
            Err(e) => {
                tracing::debug!("Skipped skin {skin} of {champion} in the skinhack check: {e}");
                continue;
            }
        };

        for slot in Slot::ALL {
            if let Some(path) = mesh_path(&object, slot) {
                meshes.push(OtherMesh {
                    skin,
                    slot,
                    path: path.to_owned(),
                });
            }
        }
    }

    meshes
}

/// Returns the file of layer `layer` at `hash`, or `None` if the layer does not ship it.
fn shipped<'p>(project: &'p ProjectFiles, layer: &str, hash: WadHash) -> Option<FileHandle<'p>> {
    project
        .files()
        .find(|file| file.layer() == layer && file.wad_hash() == Some(hash))
}

/// Reads `path` from layer `layer`, or from the game if the layer does not ship it.
///
/// # Errors
///
/// Fails if the chunk does not read.
fn read_merged(
    project: &ProjectFiles,
    layer: &str,
    game: &dyn GameContent,
    path: &str,
) -> Result<Option<Vec<u8>>, String> {
    let hash = WadHash::from(path);
    match shipped(project, layer, hash) {
        Some(file) => file.bytes().map(Some),
        None => game.read(hash),
    }
}

/// Returns the decompressed size and the SHA-256 of `path`, from layer `layer` or from the
/// game if the layer does not ship it. Returns `None` if neither contains it.
///
/// # Errors
///
/// Fails if the chunk does not read.
fn merged_digest(
    project: &ProjectFiles,
    layer: &str,
    game: &dyn GameContent,
    path: &str,
) -> Result<Option<(u64, [u8; 32])>, String> {
    let hash = WadHash::from(path);
    if let Some(file) = shipped(project, layer, hash) {
        let bytes = file.bytes()?;
        return Ok(Some((bytes.len() as u64, Sha256::digest(&bytes).into())));
    }

    let Some(size) = game.size(hash) else {
        return Ok(None);
    };
    Ok(game.digest(hash)?.map(|digest| (size, digest)))
}

/// Returns the path that `slot` of the skin object `object` names.
fn mesh_path(object: &BinObject, slot: Slot) -> Option<&str> {
    let mesh = embed(object.properties.get(&named("SkinMeshProperties")))?;
    text(mesh.properties.get(&named(slot.field())))
}

/// Returns every name field of the skin object `object` that names another skin.
///
/// Reads `ChampionSkinName`, then `SkinAudioProperties.TagEventList` and
/// `SkinAudioProperties.BankUnits.Name` into one [`Evidence::Audio`].
fn other_skin_names(object: &BinObject, markers: &Markers) -> Vec<Evidence> {
    let mut found = Vec::new();

    if let Some(name) = text(object.properties.get(&named("ChampionSkinName")))
        && markers.names(name)
    {
        found.push(Evidence::Name {
            value: name.to_owned(),
        });
    }

    let Some(audio) = embed(object.properties.get(&named("SkinAudioProperties"))) else {
        return found;
    };
    let tags: Vec<String> = items(audio.properties.get(&named("TagEventList")))
        .iter()
        .filter_map(|tag| text(Some(tag)))
        .filter(|tag| markers.names(tag))
        .map(str::to_owned)
        .collect();
    let units: Vec<String> = items(audio.properties.get(&named("BankUnits")))
        .iter()
        .filter_map(unit_name)
        .filter(|name| markers.names_unit(name))
        .map(str::to_owned)
        .collect();

    if !tags.is_empty() || !units.is_empty() {
        found.push(Evidence::Audio { tags, units });
    }
    found
}

/// Returns the `Name` of the bank unit `unit`.
fn unit_name(unit: &PropertyValueEnum) -> Option<&str> {
    text(embed(Some(unit))?.properties.get(&named("Name")))
}

/// Returns whether `value` contains `marker`, then a skin number other than 0, then `suffix`.
///
/// Compares case-insensitively, so `marker` and `suffix` are lowercase. `AatroxSkin07` names
/// another skin for the marker `aatroxskin`, and `AatroxSkin0` does not.
fn names_other_skin(value: &str, marker: &str, suffix: &str) -> bool {
    let value = value.to_ascii_lowercase();
    let mut rest = value.as_str();

    while let Some(at) = rest.find(marker) {
        let tail = &rest[at + marker.len()..];
        let digits = tail.len() - tail.trim_start_matches(|c: char| c.is_ascii_digit()).len();
        if tail[..digits].parse::<u32>().is_ok_and(|skin| skin != 0)
            && tail[digits..].starts_with(suffix)
        {
            return true;
        }
        rest = tail;
    }

    false
}

fn embed(value: Option<&PropertyValueEnum>) -> Option<&Struct> {
    match value? {
        PropertyValueEnum::Embedded(embedded) => Some(&embedded.0),
        PropertyValueEnum::Struct(inner) => Some(inner),
        _ => None,
    }
}

fn items(value: Option<&PropertyValueEnum>) -> &[PropertyValueEnum] {
    match value {
        Some(PropertyValueEnum::Container(list)) => list.items(),
        Some(PropertyValueEnum::UnorderedContainer(list)) => list.0.items(),
        _ => &[],
    }
}

fn text(value: Option<&PropertyValueEnum>) -> Option<&str> {
    match value? {
        PropertyValueEnum::String(string) => Some(&string.value),
        _ => None,
    }
}

fn embed_mut(value: Option<&mut PropertyValueEnum>) -> Option<&mut Struct> {
    match value? {
        PropertyValueEnum::Embedded(embedded) => Some(&mut embedded.0),
        PropertyValueEnum::Struct(inner) => Some(inner),
        _ => None,
    }
}

fn list_mut(value: Option<&mut PropertyValueEnum>) -> Option<&mut Container> {
    match value? {
        PropertyValueEnum::Container(list) => Some(list),
        PropertyValueEnum::UnorderedContainer(list) => Some(&mut list.0),
        _ => None,
    }
}

#[cfg(test)]
mod tests;

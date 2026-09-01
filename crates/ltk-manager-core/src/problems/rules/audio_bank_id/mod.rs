//! `audio/bank-id` - a Wwise bank carrying no soundbank id.
//!
//! A bank's header carries an id, and the Wwise toolchain derives it from the
//! bank's own name when it builds one. A bank carrying zero was written by
//! something that never assigned one.
//!
//! **The name survives an unpack in the bin that asks for the bank.** A chunk
//! no hashtable named is written out as the hex of its own hash, and hashing
//! that would write an id belonging to nothing. A bank unit lists the bank's
//! path in plaintext, so that is what resolves the hash back - and a bank no
//! unit lists is one the game never asks for and so never loads.
//!
//! **The id is the signal, and the version is not.** Across 7,829 shipped
//! banks the versions run 125 through 145, so a version check would report the
//! game's own content. Zero is the value the game never ships.
//!
//! **What it costs is not established, so this reports at `Info`.**

use crate::problems::bank_units::BankUnits;
use crate::problems::budget;
use crate::problems::{
    Applied, Detail, FileHandle, FixError, FixPreview, FixRun, Problem, ProjectFiles, Report, Rule,
    RuleId, Severity, Site,
};
use crate::workshop::WorkshopFileKind;

/// The id every row of this rule carries.
pub const ID: RuleId = RuleId("audio/bank-id");

/// The four bytes a bank opens with, naming its header chunk.
const HEADER: [u8; 4] = *b"BKHD";

/// The header, magic through soundbank id, which is all the check reads.
const HEADER_BYTES: usize = 16;

/// Where the soundbank id sits, counted from the start of the bank.
///
/// The header chunk's own id and length come first, then the generator version,
/// then this.
const BANK_ID_AT: usize = 12;

/// The offset basis of the 32-bit FNV hash.
const FNV_BASIS: u32 = 0x811C_9DC5;

/// The prime of the 32-bit FNV hash.
const FNV_PRIME: u32 = 0x0100_0193;

/// Reports a Wwise bank carrying no soundbank id.
#[derive(Debug, Default)]
pub struct AudioBankId;

impl AudioBankId {
    #[must_use]
    pub fn new() -> Self {
        Self
    }
}

impl Rule for AudioBankId {
    fn id(&self) -> RuleId {
        ID
    }

    fn title(&self) -> &'static str {
        "Unset soundbank id"
    }

    fn description(&self) -> &'static str {
        "The audio bank has no id"
    }

    fn unfixable_description(&self) -> &'static str {
        "Couldn't derive an id because the bank's intended name is unknown"
    }

    fn severity(&self) -> Option<Severity> {
        Some(Severity::Info)
    }

    fn check(&self, project: &ProjectFiles, report: &mut Report) {
        let handles: Vec<_> = project.of_kind(WorkshopFileKind::WwiseBank).collect();
        let read = project.budget().map(
            &handles,
            budget::files_at_once(),
            |_| HEADER_BYTES as u64,
            bank_id_of,
        );

        let mut unset = Vec::new();
        for (handle, found) in handles.iter().zip(read) {
            let site = || Site::file(handle.layer(), handle.path());
            match found {
                Some(Ok(Some(0))) => unset.push(handle),
                Some(Ok(_)) => {}
                Some(Err(e)) => report.failure(ID, Some(site()), e),
                /* Cancelled before this file was reached. Saying nothing about
                it is what keeps a partial run from reading as a clean one. */
                None => report.failure(ID, Some(site()), "The check was cancelled"),
            }
        }

        // Every bin of the mod, parsed a second time. Only a chunk an unpack
        // named by its hash needs one, so the parse waits until one turns up.
        let units = if unset
            .iter()
            .any(|handle| named_stem(handle.path()).is_none())
        {
            BankUnits::of(project)
        } else {
            BankUnits::default()
        };

        for handle in unset {
            report.problem(
                ID,
                Severity::Info,
                Site::file(handle.layer(), handle.path()),
                detail(handle, &units),
            );
        }
    }

    /// Writes the id the bank's own name hashes to.
    fn fix(&self, problems: &[&Problem], run: &mut FixRun<'_>) -> Result<Applied, FixError> {
        // The mod as it is now, because a bank unit naming a hash-named chunk
        // is a fact about the rest of it and the rest of it may have changed.
        let project = ProjectFiles::read(run.project_root(), run.config(), run.game()).ok();
        let units = project.as_ref().map(BankUnits::of).unwrap_or_default();
        let mut applied = Applied::default();

        for problem in problems {
            let (layer, path) = (problem.site.layer.clone(), problem.site.path.clone());
            let handle = project.as_ref().and_then(|project| {
                project
                    .files()
                    .find(|handle| handle.layer() == layer && handle.path() == path)
            });
            let Some(id) = handle
                .as_ref()
                .and_then(|handle| bank_id_for(handle, &units))
            else {
                applied.skipped += 1;
                run.skipped(&layer, &path, 1);
                continue;
            };

            let mut bytes = run.read(&layer, &path)?;
            // Re-read from the file rather than trusted from the check, so a
            // bank rebuilt since the run keeps the id its builder gave it.
            if !carries_no_id(&bytes) {
                applied.skipped += 1;
                run.skipped(&layer, &path, 1);
                continue;
            }

            bytes[BANK_ID_AT..BANK_ID_AT + 4].copy_from_slice(&id.to_le_bytes());
            run.write(&layer, &path, &bytes, 1, 0)?;
            applied.applied += 1;
        }

        Ok(applied)
    }
}

/// The soundbank id in one bank's header.
///
/// `None` for a bank whose header is shorter than the field, which is a file
/// the rule says nothing about rather than one it reports.
///
/// # Errors
///
/// Reports a file it could not read, and one whose first bytes are not a bank
/// at all.
fn bank_id_of(handle: &FileHandle<'_>) -> Result<Option<u32>, String> {
    let head = handle.head(HEADER_BYTES)?;
    if head.first_chunk::<4>() != Some(&HEADER) {
        return Err(String::from("This is not an audio bank"));
    }

    Ok(head
        .get(BANK_ID_AT..BANK_ID_AT + 4)
        .and_then(|id| id.try_into().ok())
        .map(u32::from_le_bytes))
}

/// Whether `bytes` is still a bank whose header carries no id.
fn carries_no_id(bytes: &[u8]) -> bool {
    bytes.first_chunk::<4>() == Some(&HEADER)
        && bytes
            .get(BANK_ID_AT..BANK_ID_AT + 4)
            .and_then(|id| id.try_into().ok())
            .map(u32::from_le_bytes)
            == Some(0)
}

/// The id the engine will address `handle`'s bank by.
///
/// An unpack names a chunk by the hash of its path, and hashing 16 hex digits
/// would write an id belonging to nothing. A bank unit names the file in
/// plaintext, so that hash resolves back to the path its author wrote.
///
/// `None` where no unit names it either, which is a bank the game never asks
/// for and so never loads.
fn bank_id_for(handle: &FileHandle<'_>, units: &BankUnits) -> Option<u32> {
    if let Some(stem) = named_stem(handle.path()) {
        return Some(bank_id_of_name(stem));
    }
    let named = units.path_of(handle.wad_hash()?)?;
    named_stem(named).map(bank_id_of_name)
}

/// The bank's own name in `path`, without its extension.
///
/// `None` where the last segment is a WAD chunk hash rather than a name, which
/// is what an unpack leaves behind for a path no hashtable resolved.
fn named_stem(path: &str) -> Option<&str> {
    let name = path.rsplit('/').next()?;
    let stem = name.rsplit_once('.').map_or(name, |(before, _)| before);
    (!stem.is_empty() && !is_hash_named(stem)).then_some(stem)
}

/// Whether `stem` is a WAD chunk hash written as hex rather than a bank name.
fn is_hash_named(stem: &str) -> bool {
    stem.len() == 16 && stem.bytes().all(|b| b.is_ascii_hexdigit())
}

/// `FNV-1` over the ASCII-lowercased bytes of `name`.
///
/// This is FNV-1 and not FNV-1a: the multiply comes first and the xor second,
/// and swapping them gives an unrelated value.
fn bank_id_of_name(name: &str) -> u32 {
    name.bytes().fold(FNV_BASIS, |hash, byte| {
        hash.wrapping_mul(FNV_PRIME) ^ u32::from(byte.to_ascii_lowercase())
    })
}

/// What one finding says, and what the repair would write into it.
fn detail(handle: &FileHandle<'_>, units: &BankUnits) -> Detail {
    let message = String::from(
        "The header holds zero where the format wants FNV-1 of the bank's own name. Nothing is known to read the field, and the repair writes the value that name hashes to.",
    );

    match bank_id_for(handle, units) {
        Some(id) => Detail {
            mismatch: None,
            message: Some(message),
            fix: Some(FixPreview::value("0", format!("{id:#010X}"))),
        },
        None => Detail::new(message),
    }
}

#[cfg(test)]
mod tests;

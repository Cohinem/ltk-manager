//! `audio/bank-id` - a Wwise bank carrying no soundbank id.
//!
//! A bank's header carries an id, and the Wwise toolchain derives it from the
//! bank's own name when it builds one. A bank carrying zero was written by
//! something that never assigned one.
//!
//! **The id is the signal, and the version is not.** Across 7,829 shipped
//! banks the versions run 125 through 145, so a version check would report the
//! game's own content. Zero is the value the game never ships.
//!
//! **What it costs is not established, so this reports at `Info`** - see
//! docs/research/audio-bank-id-repairability.md.

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
        "An audio bank whose header carries no soundbank id. The tool that builds a bank derives one from the bank's name, so a bank without it was written by something that did not"
    }

    fn unfixable_description(&self) -> &'static str {
        "Couldn't derive an id because this chunk is named by its hash rather than by the bank's name"
    }

    fn check(&self, project: &ProjectFiles, report: &mut Report) {
        let handles: Vec<_> = project.of_kind(WorkshopFileKind::WwiseBank).collect();
        let read = project.budget().map(
            &handles,
            budget::files_at_once(),
            |_| HEADER_BYTES as u64,
            bank_id_of,
        );

        for (handle, found) in handles.iter().zip(read) {
            let site = || Site::file(handle.layer(), handle.path());
            match found {
                Some(Ok(Some(0))) => {
                    report.problem(ID, Severity::Info, site(), detail(handle.path()));
                }
                Some(Ok(_)) => {}
                Some(Err(e)) => report.failure(ID, Some(site()), e),
                /* Cancelled before this file was reached. Saying nothing about
                it is what keeps a partial run from reading as a clean one. */
                None => report.failure(ID, Some(site()), "The check was cancelled"),
            }
        }
    }

    /// Writes the id the bank's own name hashes to.
    fn fix(&self, problems: &[&Problem], run: &mut FixRun<'_>) -> Result<Applied, FixError> {
        let mut applied = Applied::default();

        for problem in problems {
            let (layer, path) = (problem.site.layer.clone(), problem.site.path.clone());
            let Some(id) = bank_id_for(&path) else {
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

/// The id the engine will address the bank at `path` by.
///
/// `None` for a chunk an unpack named by its hash, where the file name is not
/// the bank's and hashing it would write an id belonging to nothing.
fn bank_id_for(path: &str) -> Option<u32> {
    let name = path.rsplit('/').next()?;
    let stem = name.rsplit_once('.').map_or(name, |(before, _)| before);
    if stem.is_empty() || is_hash_named(stem) {
        return None;
    }
    Some(bank_id_of_name(stem))
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
fn detail(path: &str) -> Detail {
    let message = String::from(
        "Every bank the game ships carries an id, and this one carries none, so it was not built by Wwise. Nothing is known to read the field, and the repair writes the id the bank's own name hashes to.",
    );

    match bank_id_for(path) {
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

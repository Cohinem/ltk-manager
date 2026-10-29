//! `audio/bank-version` - an audio bank the game's reader will not load.
//!
//! The reader gates a bank on the generator version in its header, and the gate
//! is conditional on what the bank holds. The version it takes as current loads
//! whatever it carries. An older version, down to a floor, loads only if it
//! carries nothing beyond its media index and its media blob - so a legacy
//! media bank loads, and a legacy bank carrying the objects that hold events
//! and sounds does not. `ltk_wwise` holds that gate as `Bank::check`, and the
//! rule reads every bank through it.
//!
//! A rejected bank is dropped **silently**. Nothing is written to the log and
//! nothing is shown, so a mod whose sounds never play looks like a mod that
//! works, which is why this is worth a check at all.
//!
//! Two things keep the rule honest, and both are refusals:
//!
//! - **The version alone is not the predicate.** Most legacy banks in the wild
//!   are media-only and load perfectly, and the game itself ships hundreds of
//!   them. A rule keyed on the version would report every one.
//! - **The rule judges downwards only.** A bank at or above
//!   `BankVersion::CURRENT` is never reported, and its check is a head read of
//!   the version. Judged downwards a stale constant goes quiet rather than
//!   calling every newly authored bank defective, and the class this reports
//!   stays reported, because a bank at an old version does not become valid
//!   later.
//!
//! A legacy bank that `ltk_wwise` cannot read is reported with the reader's
//! error. The client reads chunks in sequence and fails on the same files.
//!
//! # The repair
//!
//! An overlay archive is the game's own archive with the mod's overrides
//! layered over it, so removing a mod's bank does not leave a hole - it leaves
//! the bank the game shipped. On the ordinary sound mod that is not a
//! consolation prize: the mod ships its media bank as well, that one loads, and
//! the game's own events then fire against the mod's media. **The repair does
//! not restore the game's audio, it makes the mod play the audio its author
//! shipped.**
//!
//! What deletion has to answer is therefore not "does anything reference this
//! file" but *after removing it, can every request for it still be answered*.
//! Those give different answers, and the difference is the whole guard:
//!
//! | Asked for by a bank unit | The install holds the path | Verdict                        |
//! | ------------------------ | -------------------------- | ------------------------------ |
//! | yes                      | yes                        | remove - the game's own answers |
//! | yes                      | no                         | refuse - nothing would answer   |
//! | no                       | either                     | remove - nobody asks            |
//!
//! Reference alone is the wrong axis. It says who asks, and only the install
//! says who can answer.

use std::io::Cursor;

use crate::bank_units::BankUnits;
use crate::game::GameContent;
use crate::{
    AlternativeId, Applied, Detail, FileHandle, FixAlternative, FixError, FixPreview, FixRun, Head,
    Pass, Problem, ProblemSeverity, Rule, RuleId, RuleMeta, Site, Weight,
};
use ltk_manager_assets::file_kind::WorkshopFileKind;
use ltk_manager_audio::ltk_wwise::bank::{BankVersion, Rejection};
use ltk_manager_audio::ltk_wwise::hierarchy::ObjectKind;
use ltk_manager_audio::ltk_wwise::{self, Bank};

/// The diagnostics code a request nothing can answer is recorded under.
const UNANSWERED_CODE: &str = "ALE-9B39AA45";

/// The id every row of this rule carries.
pub const ID: RuleId = RuleId("audio/bank-version");

/// The bytes the check reads first: the `BKHD` tag, its length and the version.
const VERSION_HEAD: usize = 12;

/// Where the version sits, after the `BKHD` tag and its length.
const VERSION_AT: usize = 8;

/// The id of the alternative that converts a rejected bank to version 145.
const CONVERT: &str = "convert";

/// Whether the conversion is labeled experimental.
///
/// No converted bank has loaded in a match yet. A passed upgrade check of the in-game
/// checks (#954) is what clears this.
const CONVERSION_EXPERIMENTAL: bool = true;

/// Reports an audio bank the game drops without saying so.
#[derive(Debug, Default)]
pub struct AudioBankVersion;

impl AudioBankVersion {
    #[must_use]
    pub fn new() -> Self {
        Self
    }
}

/// The rule as the catalogue lists it.
const META: RuleMeta = RuleMeta {
    id: ID,
    title: "Unsupported audio bank version",
    description: "An audio bank at a version the game's reader drops, so the mod plays no sound",
    unfixable: "Couldn't remove because the bank unit naming this file would have to be edited too",
    severity: Some(ProblemSeverity::Warning),
};

impl Rule for AudioBankVersion {
    fn meta(&self) -> &RuleMeta {
        &META
    }

    fn subscribe(&self, pass: &mut Pass<'_>) {
        let rejected = pass
            .files(WorkshopFileKind::WwiseBank)
            .head(VERSION_HEAD)
            /* A legacy bank is read whole, and that is the read worth
            reserving for. */
            .weighing(Weight::Whole)
            .collect(rejection_of);
        let asked = pass.demand::<BankUnits>();
        let game = pass.game();
        pass.finish(move |finish| {
            let asked = finish.fact(asked);
            for (handle, bank) in finish.take(rejected) {
                let Some(bank) = bank else {
                    continue;
                };
                let removal = removable(&handle, game, asked);
                finish.problem(
                    ProblemSeverity::Warning,
                    Site::file(handle.layer(), handle.path()),
                    bank.detail(removal),
                );
            }
        });
    }

    fn fix(&self, problems: &[&Problem], run: &mut FixRun<'_>) -> Result<Applied, FixError> {
        // The mod as the run has left it, because the guard is a claim about
        // the rest of it and the rest of it may have changed since the check.
        let asked = match run.fact::<BankUnits>() {
            Ok(asked) => asked,
            Err(e) => {
                tracing::warn!(
                    "Removing nothing from {}, which would not read: {e}",
                    run.root().display()
                );
                return Ok(run.skip_all(problems));
            }
        };

        run.per_file(problems, |run, layer, path| {
            // Found in the listing before it is read, because a bank a previous
            // run already removed has no bytes to judge and is not an error.
            let removes = match run.project() {
                Ok(project) => match project.file(layer, path) {
                    Some(handle) if removable(&handle, project.game(), &asked).is_ok() => {
                        judged(&run.read(layer, path)?).is_some()
                    }
                    _ => false,
                },
                Err(_) => false,
            };
            if !removes {
                return Ok(false);
            }

            run.remove(layer, path, 1)?;
            Ok(true)
        })
    }

    /// Converts each bank to version 145, if the bank on disk is still rejected and the
    /// conversion reads back.
    fn fix_alternative(
        &self,
        alternative: &AlternativeId,
        problems: &[&Problem],
        run: &mut FixRun<'_>,
    ) -> Result<Applied, FixError> {
        if alternative.as_str() != CONVERT {
            return Ok(run.skip_all(problems));
        }

        run.per_file(problems, |run, layer, path| {
            let listed = run
                .project()
                .is_ok_and(|project| project.file(layer, path).is_some());
            if !listed {
                return Ok(false);
            }

            match conversion_of(&run.read(layer, path)?) {
                Ok(converted) => {
                    run.write(layer, path, &converted, 1, 0)?;
                    Ok(true)
                }
                Err(why) => {
                    tracing::info!("Converting nothing at {layer}/{path}: {why}");
                    Ok(false)
                }
            }
        })
    }
}

/// Converts the bank `bytes` to version 145 and returns the bytes to write.
///
/// # Errors
///
/// Fails if the bank does not read, if the client accepts it, or if [`converted`] fails.
fn conversion_of(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let bank = Bank::from_reader(&mut Cursor::new(bytes)).map_err(|error| error.to_string())?;
    if bank.header().version >= BankVersion::CURRENT || bank.check().is_ok() {
        return Err(String::from("the client accepts the bank"));
    }

    converted(&bank)
}

/// What would answer for this bank once it is gone, or why nothing would.
fn removable(
    handle: &FileHandle<'_>,
    game: Option<&dyn GameContent>,
    asked: &BankUnits,
) -> Result<Removed, String> {
    let Some(chunk) = handle.wad_hash() else {
        return Err(String::from(
            "This file is not in one of the mod's WADs, so the manager cannot tell what would answer for it once it is gone.",
        ));
    };

    let Some(game) = game else {
        return Err(String::from(
            "Removing this bank is only safe where your game holds one at the same path, and there is no League install to ask.",
        ));
    };

    if game.contains(chunk) {
        return Ok(Removed::GameAnswers);
    }
    if asked.asks_for(chunk) {
        return Err(format!(
            "A bank unit asks for this file and your game holds nothing at that path, so removing it leaves a request nothing can answer, which a crash log records as {UNANSWERED_CODE}.",
        ));
    }
    Ok(Removed::NobodyAsks)
}

/// What answers for a removed bank.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Removed {
    /// The install holds a bank at the same path.
    GameAnswers,
    /// No bank unit of the mod asks for the path at all.
    NobodyAsks,
}

impl Removed {
    /// What a row says the repair will do.
    fn note(self) -> &'static str {
        match self {
            Self::GameAnswers => {
                "Removed, and your game's own bank answers instead, so the mod's media still plays"
            }
            Self::NobodyAsks => "Removed. Nothing in the mod asks for this file",
        }
    }
}

/// Reads what the client refuses about one bank, or `None` for one it loads.
///
/// `head` holds the bank's version. A bank below `BankVersion::CURRENT` is read
/// whole, under the [`Weight::Whole`] the subscription declares.
///
/// # Errors
///
/// Fails for a file that cannot be read, and for one whose first bytes are not a bank.
fn rejection_of(head: &Head<'_>) -> Result<Option<Rejected>, String> {
    let version =
        version_in(head.bytes()).ok_or_else(|| String::from("This is not an audio bank"))?;
    if version >= BankVersion::CURRENT {
        return Ok(None);
    }

    Ok(judged(&head.handle().bytes()?))
}

/// Judges the whole bank `bytes` as the client does. Returns `None` for a bank it loads.
fn judged(bytes: &[u8]) -> Option<Rejected> {
    if version_in(bytes)? >= BankVersion::CURRENT {
        return None;
    }

    let bank = match Bank::from_reader(&mut Cursor::new(bytes)) {
        Ok(bank) => bank,
        Err(error) => return Some(Rejected::Unreadable(error.to_string())),
    };
    let rejection = bank.check().err()?;

    let conversion = converted(&bank).map(|_| Conversion {
        version: bank.header().version,
        attenuation: holds_attenuation(&bank),
    });
    Some(Rejected::Refused {
        rejection,
        conversion,
    })
}

/// Converts `bank` to version 145 and returns the bytes to write.
///
/// The bytes are read back, and the conversion fails unless the read-back equals the
/// upgraded bank and passes `Bank::check`. The writer pads the header to align the media,
/// so the comparison takes the header padding from the read-back and requires it to be
/// zero.
///
/// # Errors
///
/// Fails with the reason as a sentence fragment if `Bank::upgrade` refuses the bank, or if
/// the written bank does not read back as the upgraded one.
fn converted(bank: &Bank) -> Result<Vec<u8>, String> {
    let upgraded = bank.upgrade().map_err(|error| match error {
        ltk_wwise::Error::Upgrade(refusal) => refusal.to_string(),
        error => error.to_string(),
    })?;

    let mut bytes = Vec::new();
    upgraded
        .to_writer(&mut bytes)
        .map_err(|error| error.to_string())?;

    let read_back = Bank::from_reader(&mut Cursor::new(&bytes))
        .map_err(|error| format!("the converted bank does not read back: {error}"))?;
    let padding = &read_back.header().padding;
    let mut expected = upgraded;
    expected.header_mut().padding.clone_from(padding);
    if padding.iter().any(|byte| *byte != 0) || read_back != expected {
        return Err(String::from(
            "the converted bank does not read back as it was written",
        ));
    }
    read_back
        .check()
        .map_err(|rejection| format!("the converted bank is still rejected: {rejection}"))?;

    Ok(bytes)
}

/// Whether `bank` holds an Attenuation object, whose version 145 flag has no legacy value.
fn holds_attenuation(bank: &Bank) -> bool {
    bank.hierarchy()
        .is_some_and(|hierarchy| hierarchy.of_kind(ObjectKind::ATTENUATION).next().is_some())
}

/// Reads the version of the bank that `bytes` begin, or `None` if they are not a bank.
fn version_in(bytes: &[u8]) -> Option<BankVersion> {
    if bytes.first_chunk::<4>()? != b"BKHD" {
        return None;
    }

    let version = bytes.get(VERSION_AT..VERSION_AT + 4)?;
    Some(BankVersion(u32::from_le_bytes(version.try_into().ok()?)))
}

/// A bank the game's reader will not load, and why.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Rejected {
    /// `Bank::check` refuses the bank.
    Refused {
        rejection: Rejection,
        /// The conversion a dry run allows, or why it refuses.
        conversion: Result<Conversion, String>,
    },
    /// The bank does not read, with the reader's error.
    Unreadable(String),
}

/// A conversion of a rejected bank that a dry run allows.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Conversion {
    /// The version of the bank before the conversion.
    version: BankVersion,
    /// Whether the bank holds an Attenuation object.
    attenuation: bool,
}

impl Conversion {
    /// Returns the conversion as the alternative a finding offers.
    ///
    /// The lost attenuation flag is section 11 of `docs/design/wwise-audio.md` in `ltk_wwise`.
    fn alternative(self) -> FixAlternative {
        let mut note = String::from("Rewritten at version 145. The events keep their IDs.");
        if self.attenuation {
            note.push_str(
                " One attenuation flag of version 145 has no value in this bank and is written as zero.",
            );
        }

        FixAlternative {
            id: AlternativeId::new(CONVERT),
            title: String::from("Convert to version 145"),
            experimental: CONVERSION_EXPERIMENTAL,
            fix: FixPreview {
                note: Some(note),
                before: Some(self.version.to_string()),
                after: Some(BankVersion::CURRENT.to_string()),
            },
        }
    }
}

impl Rejected {
    /// Builds the detail of one finding from the rejection and what removing the bank leaves.
    fn detail(&self, removal: Result<Removed, String>) -> Detail {
        let mut message = self.sentence();

        let fix = match removal {
            Ok(removed) => Some(FixPreview::note(removed.note())),
            Err(why) => {
                message.push(' ');
                message.push_str(&why);
                None
            }
        };

        let alternatives = match self {
            Self::Refused {
                conversion: Ok(conversion),
                ..
            } => vec![conversion.alternative()],
            Self::Refused {
                conversion: Err(why),
                ..
            } => {
                message.push_str(&format!(
                    " The bank cannot be converted to version 145 because {why}."
                ));
                Vec::new()
            }
            Self::Unreadable(_) => Vec::new(),
        };

        Detail {
            mismatch: None,
            message: Some(message),
            fix,
            alternatives,
        }
    }

    /// Returns why the reader refuses this bank: the rejection's own text, then its effect.
    fn sentence(&self) -> String {
        let rejection = match self {
            Self::Refused { rejection, .. } => rejection,
            Self::Unreadable(error) => {
                return format!(
                    "The game's audio reader cannot read this bank: {error}. It drops the bank without a word and nothing in it plays."
                );
            }
        };

        let effect = match rejection {
            Rejection::Version(version) if *version < BankVersion::CURRENT => {
                "The bank is older than the game's audio reader reads at all, so it drops the bank without a word and nothing in it plays."
            }
            Rejection::LegacyChunk { .. } => {
                "Below version 145 the game's audio reader takes a bank only if it carries nothing but media, so it drops this one without a word and the mod is silent."
            }
            _ => "The game's audio reader drops the bank without a word and nothing in it plays.",
        };
        format!("{}. {effect}", capitalized(&rejection.to_string()))
    }
}

/// Returns `text` with its first letter in upper case.
fn capitalized(text: &str) -> String {
    let mut chars = text.chars();
    chars.next().map_or_else(String::new, |first| {
        first.to_uppercase().chain(chars).collect()
    })
}

#[cfg(test)]
mod tests;

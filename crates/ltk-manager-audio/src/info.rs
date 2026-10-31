//! The header facts of a Wwise file, for the `Audio` answer of an asset's info.

use std::io::Cursor;

use ltk_manager_assets::preview::{AudioContainer, AudioInfo, BankFacts};
use ltk_wwise::hierarchy::ObjectKind;
use ltk_wwise::path::AudioPath;
use ltk_wwise::{Bank, MountedPackage};

use crate::container::{AudioKind, kind_of};

/// Returns the header facts of the file `name` whose bytes are `file`.
///
/// Returns `None` if the file is no Wwise package, bank or WEM. The kind is read from the
/// extension of `name` and then from the magic. A file of a Wwise kind that does not read
/// reports the reader's error in [`AudioInfo::failure`].
#[must_use]
pub fn audio_info(name: &str, file: &[u8]) -> Option<AudioInfo> {
    let kind = kind_of(name, file)?;
    let size_bytes = file.len() as u64;

    let read = match kind {
        AudioKind::Package => package_count(file).map(|count| (count, None)),
        AudioKind::Bank => bank_facts(name, file).map(|(count, bank)| (count, Some(bank))),
        AudioKind::Media => Ok((1, None)),
    };

    let (media_count, bank, failure) = match read {
        Ok((count, bank)) => (count, bank, None),
        Err(error) => (0, None, Some(error.to_string())),
    };
    Some(AudioInfo {
        container: container_of(kind),
        size_bytes,
        media_count,
        bank,
        failure,
    })
}

fn package_count(file: &[u8]) -> ltk_wwise::Result<u32> {
    let package = MountedPackage::mount(Cursor::new(file))?;
    Ok(count(package.entries().len()))
}

fn bank_facts(name: &str, file: &[u8]) -> ltk_wwise::Result<(u32, BankFacts)> {
    let bank = Bank::from_reader(&mut Cursor::new(file))?;
    let header = bank.header();

    let named = name
        .rsplit_once('.')
        .is_some_and(|(_, extension)| extension.eq_ignore_ascii_case("bnk"));
    let facts = BankFacts {
        version: header.version.0,
        bank_type: header.bank_type.0,
        alignment: header.alignment,
        header_id: header.bank_id.0,
        name_id: named.then(|| AudioPath::new(name).bank_id().0),
        rejection: bank.check().err().map(|rejection| rejection.to_string()),
        event_count: bank
            .hierarchy()
            .map(|hierarchy| count(hierarchy.of_kind(ObjectKind::EVENT).count())),
    };

    let media_count = bank.media().map_or(0, |media| count(media.len()));
    Ok((media_count, facts))
}

fn container_of(kind: AudioKind) -> AudioContainer {
    match kind {
        AudioKind::Package => AudioContainer::Package,
        AudioKind::Bank => AudioContainer::Bank,
        AudioKind::Media => AudioContainer::Media,
    }
}

fn count(len: usize) -> u32 {
    u32::try_from(len).unwrap_or(u32::MAX)
}

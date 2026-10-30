//! Which kind of Wwise file a file is, from its name and its magic.

/// A kind of Wwise file.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum AudioKind {
    /// A package, magic `r3d2`.
    Package,
    /// A bank, whose first chunk is `BKHD`.
    Bank,
    /// A WEM, a RIFF `WAVE` file.
    Media,
}

/// Returns the kind of `file` from its magic, or `None` if it is no Wwise file.
pub(crate) fn kind_of_bytes(file: &[u8]) -> Option<AudioKind> {
    match file.get(..4)? {
        PACKAGE_MAGIC => Some(AudioKind::Package),
        BANK_MAGIC => Some(AudioKind::Bank),
        WEM_MAGIC if file.get(8..12) == Some(WEM_FORM) => Some(AudioKind::Media),
        _ => None,
    }
}

/// Returns the kind of the file `name`, read from its extension and then from its magic.
///
/// A name with the extension of another kind of file is no Wwise file. A name with a Wwise
/// extension keeps that kind when the magic is wrong, so that the reader reports the failure. A
/// game chunk has its hash for a name and is read from its magic.
pub(crate) fn kind_of(name: &str, file: &[u8]) -> Option<AudioKind> {
    let Some((_, extension)) = name.rsplit_once('.') else {
        return kind_of_bytes(file);
    };

    if extension.eq_ignore_ascii_case("wpk") {
        Some(AudioKind::Package)
    } else if extension.eq_ignore_ascii_case("bnk") {
        Some(AudioKind::Bank)
    } else if extension.eq_ignore_ascii_case("wem") {
        Some(AudioKind::Media)
    } else {
        None
    }
}

/// The magic of a package.
const PACKAGE_MAGIC: &[u8] = b"r3d2";

/// The magic of a bank: its first chunk, `BKHD`.
const BANK_MAGIC: &[u8] = b"BKHD";

/// The magic of a WEM, a RIFF file.
const WEM_MAGIC: &[u8] = b"RIFF";

/// The RIFF form type of a WEM.
const WEM_FORM: &[u8] = b"WAVE";

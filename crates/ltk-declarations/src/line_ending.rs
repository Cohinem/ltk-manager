//! How a manifest separates its lines.

/// How a file separates its lines.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum LineEnding {
    Lf,
    CrLf,
}

impl LineEnding {
    /// The ending most of `bytes` already uses, `\n` by default.
    ///
    /// A file mixing both keeps the ending it mostly has: one stray line from
    /// another editor does not rewrite every other line.
    pub(crate) fn of(bytes: &[u8]) -> Self {
        let lines = bytes.iter().filter(|byte| **byte == b'\n').count();
        let carried = bytes.windows(2).filter(|pair| pair == b"\r\n").count();
        if carried > 0 && carried * 2 >= lines {
            Self::CrLf
        } else {
            Self::Lf
        }
    }

    /// `text`, whose lines end in `\n`, written the way this ending spells it.
    pub(crate) fn apply(self, text: &str) -> String {
        let flat = text.replace("\r\n", "\n");
        match self {
            Self::Lf => flat,
            Self::CrLf => flat.replace('\n', "\r\n"),
        }
    }
}

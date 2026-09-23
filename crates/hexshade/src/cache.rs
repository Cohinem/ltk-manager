//! The on-disk store of translations.

use std::io;
use std::path::{Path, PathBuf};

use fs_err as fs;
use xxhash_rust::xxh64::xxh64;

use crate::{PIPELINE_VERSION, Stage, TranslateError, Translated, translate};

/// The on-disk store of translations, keyed by the blob's hash and the pipeline version.
///
/// Without a directory every read translates, which is what a test does.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct TranslationCache {
    dir: Option<PathBuf>,
}

impl TranslationCache {
    /// The store under `root`, at `v<PIPELINE_VERSION>`, or none without a root.
    #[must_use]
    pub fn new(root: Option<&Path>) -> Self {
        Self {
            dir: root.map(|root| root.join(format!("v{PIPELINE_VERSION}"))),
        }
    }

    /// The file a blob's translation lives in.
    fn path(&self, dxbc: &[u8], stage: Stage) -> Option<PathBuf> {
        let name = format!("{:016x}.{}.json", xxh64(dxbc, 0), stage.abbreviation());
        self.dir.as_ref().map(|dir| dir.join(name))
    }

    /// `dxbc` translated, off the store where it holds it, and whether it did.
    ///
    /// A store entry that will not read or parse is translated over, and a write that
    /// fails is logged, because the cache only saves time.
    pub(crate) fn translated(
        &self,
        dxbc: &[u8],
        stage: Stage,
    ) -> Result<(Translated, bool), TranslateError> {
        let path = self.path(dxbc, stage);
        if let Some(path) = &path
            && let Ok(bytes) = fs::read(path)
            && let Ok(translated) = serde_json::from_slice::<Translated>(&bytes)
        {
            return Ok((translated, true));
        }

        let translated = translate(dxbc, stage)?;

        if let Some(path) = path
            && let Err(e) = store(&path, &translated)
        {
            tracing::warn!(?path, "A translation was not cached: {e}");
        }
        Ok((translated, false))
    }
}

/// `translated` written at `path` through a temporary file, so a reader on another
/// thread sees a whole entry or none.
fn store(path: &Path, translated: &Translated) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }

    let temporary = path.with_extension(format!("{}.tmp", std::process::id()));
    fs::write(&temporary, serde_json::to_vec(translated)?)?;
    if let Err(e) = fs::rename(&temporary, path) {
        let _ = fs::remove_file(&temporary);
        if !path.is_file() {
            return Err(e);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests;

//! A bounded in-memory cache of decoded media.

use std::sync::Arc;

use lru::LruCache;
use ltk_manager_assets::preview::AssetRef;
use ltk_wwise::SourceId;
use parking_lot::Mutex;

use crate::decode::Decoded;

/// Decoded media by the asset that contains them and their source ID, bounded by a byte budget.
///
/// When the decoded bytes exceed the budget, the least recently used media are dropped. A clone
/// shares the cache.
#[derive(Debug, Clone)]
pub struct SoundCache {
    inner: Arc<Mutex<Inner>>,
}

#[derive(Debug)]
struct Inner {
    entries: LruCache<(AssetRef, SourceId), Arc<Decoded>>,
    bytes: usize,
    budget: usize,
}

impl Default for SoundCache {
    fn default() -> Self {
        Self::new(DEFAULT_BUDGET)
    }
}

impl SoundCache {
    /// Returns an empty cache that contains at most `budget` decoded bytes.
    #[must_use]
    pub fn new(budget: usize) -> Self {
        Self {
            inner: Arc::new(Mutex::new(Inner {
                entries: LruCache::unbounded(),
                bytes: 0,
                budget,
            })),
        }
    }

    /// Returns the decoded media `source` of `asset`, and decodes it with `decode` if the cache
    /// does not contain it.
    ///
    /// `decode` runs with the cache unlocked. A media larger than the budget is returned and not
    /// kept.
    ///
    /// # Errors
    ///
    /// Returns the error of `decode`. The cache keeps nothing for a failed decode.
    pub fn get_or_decode<E>(
        &self,
        asset: &AssetRef,
        source: SourceId,
        decode: impl FnOnce() -> Result<Decoded, E>,
    ) -> Result<Arc<Decoded>, E> {
        let key = (asset.clone(), source);
        if let Some(hit) = self.inner.lock().entries.get(&key) {
            return Ok(Arc::clone(hit));
        }

        let decoded = Arc::new(decode()?);

        let mut inner = self.inner.lock();
        let len = decoded.bytes.len();
        if len > inner.budget {
            return Ok(decoded);
        }

        if let Some(previous) = inner.entries.put(key, Arc::clone(&decoded)) {
            inner.bytes -= previous.bytes.len();
        }
        inner.bytes += len;

        while inner.bytes > inner.budget {
            let Some((_, evicted)) = inner.entries.pop_lru() else {
                break;
            };
            inner.bytes -= evicted.bytes.len();
        }
        Ok(decoded)
    }

    /// Drops the media of every layer file of `project`, whose files changed.
    pub fn invalidate_project(&self, project: &str) {
        let mut inner = self.inner.lock();
        let stale: Vec<(AssetRef, SourceId)> = inner
            .entries
            .iter()
            .filter(|((asset, _), _)| {
                matches!(asset, AssetRef::Layer { project: owner, .. } if owner == project)
            })
            .map(|(key, _)| key.clone())
            .collect();

        for key in stale {
            if let Some(dropped) = inner.entries.pop(&key) {
                inner.bytes -= dropped.bytes.len();
            }
        }
    }
}

/// The decoded bytes that [`SoundCache::default`] contains: 64 MiB.
const DEFAULT_BUDGET: usize = 64 * 1024 * 1024;

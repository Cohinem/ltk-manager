//! The read of every bin chunk of the install, through the object index of `ltk_game_index`.

use std::cmp::Ordering;
use std::collections::HashMap;
use std::num::NonZeroUsize;
use std::sync::Arc;

use ltk_game_index::{BuildOptions, ObjectBuildError, ResolveWadPath};
use ltk_wad::WadHash;

use ltk_manager_assets::game_wads::ChunkIndex;
use ltk_manager_base::error::{AppError, AppResult};

use super::browse::compare_paths;
use super::{Declarations, DeclaringFile, Names, ObjectIndex};

impl ObjectIndex {
    /// Reads every bin chunk of `chunks` for what it declares.
    ///
    /// One job per archive in the chunk index's order, each mounting its
    /// archive itself, on at most `workers` threads. `paths` names the chunks.
    /// A named chunk is a bin by its extension. One with a bare name, and one
    /// `paths` does not name, is decoded far enough to read its magic, and read
    /// whole only when the magic is a bin's. A chunk that will not read is
    /// skipped and counted.
    ///
    /// `called_off` is tested before each archive, so a build nobody wants
    /// stops at the next one rather than decompressing the rest.
    ///
    /// The index comes back unnamed. [`named`](Self::named) resolves it.
    ///
    /// # Errors
    ///
    /// Fails when the build was called off. An archive that will not mount is
    /// skipped and logged.
    pub fn build(
        chunks: &ChunkIndex,
        paths: &dyn ResolveWadPath,
        workers: usize,
        called_off: &(impl Fn() -> bool + Sync),
    ) -> AppResult<Self> {
        let mut options = BuildOptions::default();
        options.resolver = Some(paths);
        options.workers = NonZeroUsize::new(workers);
        options.called_off = Some(called_off);

        let index =
            ltk_game_index::ObjectIndex::build_with(chunks, &options).map_err(|e| match e {
                ObjectBuildError::CalledOff => {
                    AppError::Other("The object index build was called off".to_owned())
                }
                other => AppError::Other(format!("Could not build the object index: {other}")),
            })?;

        let files = declaring_files(&index, paths);
        let by_file = files
            .iter()
            .enumerate()
            .map(|(at, file)| (file.path_hash, at as u32))
            .collect();
        let wads = chunks
            .archives()
            .iter()
            .map(|archive| archive.name.clone())
            .collect();

        Ok(Self {
            declared: Arc::new(Declarations {
                index,
                files,
                by_file,
                wads,
            }),
            names: Names::default(),
        })
    }
}

/// Every chunk that declares an object in `index`, named through `paths`.
///
/// In archive order, and within one archive in [`compare_paths`] order with the
/// chunks `paths` does not name last, by hash.
fn declaring_files(
    index: &ltk_game_index::ObjectIndex,
    paths: &dyn ResolveWadPath,
) -> Vec<DeclaringFile> {
    let mut chunks: Vec<(WadHash, u32)> = index
        .rows()
        .chunk_by(|a, b| a.chunk == b.chunk)
        .map(|run| (run[0].chunk, run[0].archive.index() as u32))
        .collect();
    chunks.sort_unstable();
    chunks.dedup_by_key(|(chunk, _)| *chunk);

    let hashes: Vec<WadHash> = chunks.iter().map(|(chunk, _)| *chunk).collect();
    let mut named: HashMap<WadHash, Box<str>> = HashMap::new();
    paths.for_each_named(&hashes, &mut |at, path| {
        named.insert(hashes[at], path.into());
    });

    let mut files: Vec<DeclaringFile> = chunks
        .into_iter()
        .map(|(path_hash, wad)| DeclaringFile {
            path_hash,
            path: named.remove(&path_hash),
            wad,
        })
        .collect();
    files.sort_by(|a, b| {
        a.wad
            .cmp(&b.wad)
            .then_with(|| match (&a.path, &b.path) {
                (Some(a), Some(b)) => compare_paths(a, b),
                (Some(_), None) => Ordering::Less,
                (None, Some(_)) => Ordering::Greater,
                (None, None) => Ordering::Equal,
            })
            .then_with(|| a.path_hash.cmp(&b.path_hash))
    });
    files
}

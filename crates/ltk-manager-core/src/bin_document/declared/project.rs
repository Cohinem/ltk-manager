//! A project's game data declarations, applied to any chunk of the game's copy as the build
//! applies them. ADR-0042.

use std::io::Cursor;
use std::sync::Arc;

use ltk_game_data::{Edit, Selector, apply};
use ltk_hash::BinHash;
use ltk_mod_project::ModProjectLayer;
use ltk_mod_project::game_data::{LayerDeclarations, load_layer};

use super::diagnostics::Raised;
use super::{GameCopy, edits_on, read_entry};
use crate::meta_schema::PatchSchema;
use crate::workshop::ProjectDir;
use ltk_manager_base::error::{AppError, AppResult, Utf8PathRefExt as _};

/// Every layer's declarations of a project, each read once, in build order.
pub struct ProjectDeclarations {
    layers: Vec<(String, LayerDeclarations)>,
    schema: PatchSchema,
    game: Arc<dyn GameCopy>,
}

impl ProjectDeclarations {
    /// The declarations of every layer of `project`, with `game` reading the objects a
    /// reference names.
    ///
    /// # Errors
    ///
    /// Fails where the project's config or ignore rules cannot be read.
    pub fn load(
        project: &ProjectDir,
        schema: PatchSchema,
        game: Arc<dyn GameCopy>,
    ) -> AppResult<Self> {
        let root = project.path().try_as_utf8("project directory")?;
        let ignore = project.ignore_filter()?;

        let mut layers = project.config()?.layers;
        layers.sort_by(ModProjectLayer::apply_order);
        let layers = layers
            .into_iter()
            .map(|layer| {
                let loaded = load_layer(root, &layer.name, &ignore);
                (layer.name, loaded)
            })
            .collect();

        Ok(Self {
            layers,
            schema,
            game,
        })
    }

    /// The names of the layers, in build order.
    pub(super) fn layers(&self) -> impl Iterator<Item = &str> {
        self.layers.iter().map(|(name, _)| name.as_str())
    }

    /// The chunk `chunk_hash`, whose copy is `game`, with every layer's declarations applied.
    /// None where no declaration reaches it.
    ///
    /// # Errors
    ///
    /// Fails where a declaration does not apply.
    pub fn apply(&self, game: &[u8], chunk_hash: u64) -> AppResult<Option<Vec<u8>>> {
        let selects_entries = self.layers.iter().any(|(_, loaded)| {
            matches!(&loaded.declarations, Ok(Some(declarations))
                if declarations.modules.iter().any(|module| matches!(module.selector, Selector::Entries(_))))
        });
        let entries = if selects_entries {
            chunk_entries(game)
        } else {
            Vec::new()
        };

        let reaches = self.layers.iter().any(|(_, loaded)| {
            matches!(&loaded.declarations, Ok(Some(declarations))
                if declarations.modules.iter().any(|module| !edits_on(module, chunk_hash, &entries).is_empty()))
        });
        if !reaches {
            return Ok(None);
        }

        self.apply_chunk(game, chunk_hash, &entries, &mut Vec::new())
            .map(Some)
    }

    /// `game`, the chunk `chunk_hash` whose objects are `entries`, with every layer's
    /// declarations applied in build order. What each apply raises joins `raised`.
    pub(super) fn apply_chunk(
        &self,
        game: &[u8],
        chunk_hash: u64,
        entries: &[BinHash],
        raised: &mut Vec<Raised>,
    ) -> AppResult<Vec<u8>> {
        let mut bytes = game.to_vec();
        for (layer, loaded) in &self.layers {
            let Ok(Some(declarations)) = &loaded.declarations else {
                continue;
            };
            let edits: Vec<Edit> = declarations
                .modules
                .iter()
                .flat_map(|module| edits_on(module, chunk_hash, entries))
                .collect();
            if edits.is_empty() {
                continue;
            }

            let applied = apply(
                &bytes,
                &edits,
                |path| {
                    let file = loaded
                        .override_files()
                        .iter()
                        .find(|file| file.path == *path)
                        .ok_or_else(|| {
                            ltk_game_data::Error::in_document(
                                ltk_game_data::ErrorKind::InputMissing,
                                path.as_str(),
                            )
                        })?;
                    fs_err::read(&file.source)
                        .map_err(|error| ltk_game_data::Error::io(path.as_str(), &error))
                },
                |entry| read_entry(self.game.as_ref(), entry),
                &self.schema,
            )
            .map_err(|error| AppError::Other(format!("The declarations do not apply: {error}")))?;
            raised.extend(Raised::of(layer, &edits, applied.diagnostics));
            bytes = applied.bytes;
        }
        Ok(bytes)
    }
}

/// The objects a chunk declares, none where it does not mount as a bin.
fn chunk_entries(bytes: &[u8]) -> Vec<BinHash> {
    let Ok(mut stream) = ltk_meta::BinStream::mount(Cursor::new(bytes)) else {
        return Vec::new();
    };
    stream.toc().map_or_else(
        |_| Vec::new(),
        |toc| toc.entries().iter().map(|entry| entry.path_hash).collect(),
    )
}

#[cfg(test)]
mod tests;

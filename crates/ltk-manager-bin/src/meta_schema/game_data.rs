//! The meta schema as the game-data engine reads it.
//!
//! Upstream ADR-0015 in league-mod names the two questions `ltk_game_data::Schema` asks.

use std::sync::Arc;

use ltk_hash::BinHash;

use super::{MetaSchema, Shape};
use ltk_manager_base::game_build::GameBuild;

/// The meta schema at one game build, as the game-data engine reads it.
///
/// A field answers with the type its class or a base of it declares. A game build the
/// database does not describe answers with the types of the newest build the database
/// names, and knows every class. An unknown build answers no type and knows every class,
/// and its fallback is the type at the newest build.
#[derive(Debug, Clone)]
pub struct PatchSchema {
    schema: Arc<MetaSchema>,
    /// `None` where the game's build is unknown.
    build: Option<GameBuild>,
}

impl PatchSchema {
    /// The schema read at `build`.
    #[must_use]
    pub fn new(schema: Arc<MetaSchema>, build: Option<GameBuild>) -> Self {
        Self { schema, build }
    }

    /// The database the schema reads, which also names what the hash tables leave.
    #[must_use]
    pub fn meta(&self) -> &MetaSchema {
        &self.schema
    }
}

impl ltk_game_data::Schema for PatchSchema {
    fn expected(&self, class: BinHash, field: BinHash) -> Option<ltk_game_data::Shape> {
        let build = self.build?;
        let expected = if self.schema.describes(build) {
            self.schema.expected(class, field, build)
        } else {
            self.schema.newest_expected(class, field)
        };

        expected?.shape.map(Into::into)
    }

    fn fallback(&self, class: BinHash, field: BinHash) -> Option<ltk_game_data::Shape> {
        self.schema
            .newest_expected(class, field)?
            .shape
            .map(Into::into)
    }

    fn has_class(&self, class: BinHash) -> bool {
        let described = self.build.is_some_and(|build| self.schema.describes(build));

        !described || self.schema.has_class(class)
    }
}

impl From<Shape> for ltk_game_data::Shape {
    fn from(shape: Shape) -> Self {
        Self {
            kind: shape.kind,
            key: shape.key,
            item: shape.value,
        }
    }
}

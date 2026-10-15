//! `bin/texture-file` - a texture property that names a file that is not an image.
//!
//! The game creates a texture from the file that a texture property names. A
//! mesh named by the `texture` of a `VfxEmitterDefinitionData` crashed the game
//! while it loaded the effect, so a finding is [`ProblemSeverity::Fatal`].
//!
//! A property is a texture property if its name is in [`TEXTURE_FIELDS`]. In
//! the installed game of patch 16.20, every value of those properties names an
//! image file. A file is an image if its extension is in [`IMAGE_EXTENSIONS`].
//! A path without an extension is skipped.
//!
//! A `file` value is a hash. The rule reads the extension of the mod file that
//! has that hash, and skips a hash that no mod file has.
//!
//! The rule offers no repair, because the file does not record which texture
//! the author meant.

use std::collections::HashMap;

use ltk_hash::{BinHash, WadHash};
use ltk_manager_base::hashing::named;
use ltk_meta::property::Kind;
use ltk_meta::walk::{ChildSegment, Leaf, Node, Visit};

use crate::names::BinNames;
use crate::{
    Applied, BinVisitor, Detail, FixError, FixRun, NodeAddress, Pass, Problem, ProblemSeverity,
    PropertyRead, PropertyWalk, Rule, RuleId, RuleMeta, Sink, Walk,
};
use ltk_manager_bin::bin_walk::{Address, Declared};

/// The id of the rule.
pub const ID: RuleId = RuleId("bin/texture-file");

/// The properties whose value names a texture.
const TEXTURE_FIELDS: [BinHash; 27] = [
    named("texture"),
    named("erosionMapName"),
    named("textureMult"),
    named("particleColorTexture"),
    named("texturePath"),
    named("paletteTexture"),
    named("normalMapTexture"),
    named("image"),
    named("iconCircle"),
    named("iconSquare"),
    named("falloffTexture"),
    named("iconAvatar"),
    named("reflectionMapTexture"),
    named("reflectionMap"),
    named("mTextureName"),
    named("mIconPath"),
    named("mImgIconName"),
    named("gameTexture"),
    named("baseTexture"),
    named("glossTexture"),
    named("emissiveTexture"),
    named("transitionTexture"),
    named("inventoryIcon"),
    named("TextureName"),
    named("textureFile"),
    named("defaultTexturePath"),
    named("mLoadScreen"),
];

/// The extensions of the image files that the game reads as a texture.
const IMAGE_EXTENSIONS: [&str; 7] = ["tex", "dds", "png", "tga", "jpg", "jpeg", "svg"];

/// The rule that reports a texture property that names a file that is not an image.
#[derive(Debug, Default)]
pub struct BinTextureFile;

impl BinTextureFile {
    /// Returns the rule.
    #[must_use]
    pub fn new() -> Self {
        Self
    }
}

/// The catalogue entry of the rule.
const META: RuleMeta = RuleMeta {
    id: ID,
    title: "Non-image texture file",
    description: "A texture property names a file that is not an image, which crashes the game",
    unfixable: "Couldn't repair because the file does not record which texture was meant",
    severity: Some(ProblemSeverity::Fatal),
};

impl Rule for BinTextureFile {
    fn meta(&self) -> &RuleMeta {
        &META
    }

    fn subscribe(&self, pass: &mut Pass<'_>) {
        let project = pass.project();
        let names = project.names();
        let files = project
            .files()
            .filter_map(|file| Some((file.wad_hash()?, in_wad(file.path()))))
            .collect();

        pass.bins().visit(Textures { names, files });
    }

    /// Records every problem as skipped, because the rule derives no repair.
    fn fix(&self, problems: &[&Problem], run: &mut FixRun<'_>) -> Result<Applied, FixError> {
        Ok(run.skip_all(problems))
    }
}

/// The bin subscription of the rule.
struct Textures<'p> {
    names: &'p BinNames,
    /// The path of every mod file, by the hash that a `file` value names it with.
    files: HashMap<WadHash, &'p str>,
}

impl BinVisitor for Textures<'_> {
    fn begin<'r, 'f: 'r>(&'r self, sink: Sink<'f>) -> Box<dyn Walk<'f> + 'r> {
        Box::new(PropertyWalk::new(Reading { textures: self }, sink))
    }
}

/// The walk of one bin.
struct Reading<'r> {
    textures: &'r Textures<'r>,
}

impl PropertyRead for Reading<'_> {
    /// Reports each value of a texture property that names a file that is not an image.
    fn property<'a, V: Declared<'a>>(
        &mut self,
        field: BinHash,
        value: V,
        node: &Node<'_, 'a, V>,
        sink: &mut Sink<'_>,
    ) -> Result<Visit, ltk_meta::Error> {
        if !TEXTURE_FIELDS.contains(&field) {
            return Ok(Visit::Continue);
        }

        match value.kind() {
            Kind::String | Kind::WadChunkLink => self.check(value, None, field, node, sink)?,
            Kind::Optional | Kind::Container | Kind::UnorderedContainer => {
                let optional = value.kind() == Kind::Optional;
                for child in value.children()? {
                    let (segment, item) = child?;
                    let index = match segment {
                        ChildSegment::Index(index) if !optional => Some(index),
                        _ => None,
                    };
                    self.check(item, index, field, node, sink)?;
                }
            }
            _ => {}
        }
        Ok(Visit::Continue)
    }
}

impl Reading<'_> {
    /// Reports `value` if it names a file that is not an image.
    ///
    /// `index` is the position of `value` in the list that `field` holds, or `None` if
    /// `field` holds `value` itself or in an optional.
    fn check<'a, V: Declared<'a>>(
        &self,
        value: V,
        index: Option<usize>,
        field: BinHash,
        node: &Node<'_, 'a, V>,
        sink: &mut Sink<'_>,
    ) -> Result<(), ltk_meta::Error> {
        let path = match value.as_leaf()? {
            Some(Leaf::String(path)) => path,
            Some(Leaf::File(hash)) => match self.textures.files.get(&hash) {
                Some(path) => *path,
                None => return Ok(()),
            },
            _ => return Ok(()),
        };
        if is_image(path) {
            return Ok(());
        }

        let mut address = Address::of(node.trail(), field, node.class_hash(), self.textures.names);
        if let Some(index) = index {
            address.push_index(index);
        }
        sink.problem(
            ProblemSeverity::Fatal,
            Some(NodeAddress {
                entry: node.object_hash(),
                label: address.label(),
                path: address.into_hashes(),
            }),
            Detail::new(format!("`{path}` is not an image")),
        );
        Ok(())
    }
}

/// Returns the part of the layer path `path` that follows its WAD directory.
fn in_wad(path: &str) -> &str {
    path.split_once('/').map_or(path, |(_, inside)| inside)
}

/// Returns `true` if `path` has an image extension, or no extension.
fn is_image(path: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or(path);
    name.rsplit_once('.').is_none_or(|(_, extension)| {
        IMAGE_EXTENSIONS
            .iter()
            .any(|image| extension.eq_ignore_ascii_case(image))
    })
}

#[cfg(test)]
mod tests;

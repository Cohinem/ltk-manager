//! The sidecar a renderer binds a translated program by.
//!
//! SPIRV-Cross emits each cbuffer as a `vec4` array and the member names are gone, so the
//! sidecar carries every member's `RDEF` offset. Textures and samplers keep their `RDEF`
//! names beside the GLSL name of the combined sampler that samples them.

use serde::{Deserialize, Serialize};

use crate::dxbc::{Dimension, Scalar, TypeClass};

/// One uniform block, as the blob's `RDEF` laid it out.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS, specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct UniformBlock {
    /// The `RDEF` name: `$Globals`, `PerFrameVertexCB`.
    pub name: String,
    /// The block name in the GLSL, which carries the stage suffix.
    pub glsl_name: String,
    /// The buffer's size in bytes, a multiple of 16.
    pub size: u32,
    pub members: Vec<BlockMember>,
}

/// One member of a uniform block.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS, specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct BlockMember {
    pub name: String,
    /// The byte offset in the buffer.
    pub offset: u32,
    pub size: u32,
    /// Whether this permutation reads it. An unread member is compiled out and is no
    /// warning when a material writes it.
    pub used: bool,
    pub scalar: MemberScalar,
    /// Rows for a matrix, one otherwise.
    pub rows: u16,
    /// Columns for a matrix or vector, one for a scalar.
    pub columns: u16,
    /// Array length, or zero for no array.
    pub elements: u16,
    /// Whether a matrix is stored a row per `vec4`, which is how D3D packs a `float4x4`.
    pub row_major: bool,
}

/// Which typed view writes a member.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS, specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum MemberScalar {
    Float,
    Int,
    Uint,
    Bool,
}

impl MemberScalar {
    fn of(scalar: Scalar) -> Self {
        match scalar {
            Scalar::Int => Self::Int,
            Scalar::Uint => Self::Uint,
            Scalar::Bool => Self::Bool,
            Scalar::Float | Scalar::Other(_) => Self::Float,
        }
    }
}

/// One texture the shader samples, and the GLSL samplers that sample it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS, specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct TextureBinding {
    /// The `RDEF` name, suffix and all: `Diffuse_Texture__TX`, `PIXEL_COLOR_REMAP_RAMP_SharedTexture`.
    pub name: String,
    pub dimension: TextureDimension,
    /// A texture sampled by two samplers is two GLSL uniforms and costs two units.
    pub samplers: Vec<SamplerBinding>,
}

/// One combined sampler in the GLSL.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS, specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct SamplerBinding {
    /// The `RDEF` sampler name, or null for a texture read by `Load` alone.
    pub sampler: Option<String>,
    /// The GLSL uniform to bind the texture unit to.
    pub glsl_name: String,
}

/// What a texture uniform is declared as.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS, specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum TextureDimension {
    Texture2d,
    Texture2dArray,
    Texture3d,
    Cube,
    /// Six layers per cube in a 2D array, after the fix-up.
    CubeArray,
    /// An `R32UI` data texture, after the fix-up.
    Buffer,
    Other,
}

impl TextureDimension {
    fn of(dimension: Dimension) -> Self {
        match dimension {
            Dimension::Texture2d => Self::Texture2d,
            Dimension::Texture2dArray => Self::Texture2dArray,
            Dimension::Texture3d => Self::Texture3d,
            Dimension::Cube => Self::Cube,
            Dimension::CubeArray => Self::CubeArray,
            Dimension::Buffer => Self::Buffer,
            _ => Self::Other,
        }
    }
}

/// One vertex attribute the vertex shader reads.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS, specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct Attribute {
    /// The semantic without its index: `POSITION`, `BLENDINDICES`.
    pub semantic: String,
    pub index: u32,
    /// The GLSL attribute name.
    pub glsl_name: String,
    /// Which of `xyzw` the shader reads, as a four-bit mask.
    pub mask: u8,
}

/// What a translated stage binds.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS, specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct Sidecar {
    pub blocks: Vec<UniformBlock>,
    pub textures: Vec<TextureBinding>,
    /// Empty for a pixel shader.
    pub attributes: Vec<Attribute>,
}

pub(crate) fn member_scalar(scalar: Scalar) -> MemberScalar {
    MemberScalar::of(scalar)
}

pub(crate) fn texture_dimension(dimension: Dimension) -> TextureDimension {
    TextureDimension::of(dimension)
}

pub(crate) fn row_major(class: TypeClass) -> bool {
    /* D3D's default `column_major` packs a column per register. dxbc-spirv reads the
    bytes as the reflection describes them, so this is only what a writer needs to lay a
    matrix out with. */
    matches!(class, TypeClass::MatrixRows)
}

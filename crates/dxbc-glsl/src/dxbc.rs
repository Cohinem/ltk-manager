//! The DXBC container and the three chunks a binding reads: `RDEF`, `ISGN` and `OSGN`.
//!
//! The engine binds every constant buffer member, texture and sampler by the name in
//! `RDEF`, and a vertex layout by the semantics in `ISGN`. Register slots are read only to
//! join dxbc-spirv's register-named variables back to those names.

use std::collections::HashMap;

use thiserror::Error;

/// A DXBC container's header: a 32-byte hash, a version, the size, and the chunk offsets.
const CHUNK_COUNT_OFFSET: usize = 28;
const CHUNK_TABLE_OFFSET: usize = 32;
/// Where the container's own size sits, which a bundle record's extra byte is not part of.
const SIZE_OFFSET: usize = 24;
const MAGIC: &[u8; 4] = b"DXBC";

/// A container that is too short, or one that is not a container at all.
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum ContainerError {
    #[error("not a DXBC container")]
    NotDxbc,
    #[error("DXBC container truncated at byte {at}")]
    Truncated { at: usize },
    #[error("DXBC container has no {chunk} chunk")]
    MissingChunk { chunk: &'static str },
}

/// One resource `RDEF` declares, keyed by its register slot within its kind.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Resource {
    pub name: String,
    pub kind: ResourceKind,
    pub dimension: Dimension,
    pub bind: u32,
    pub count: u32,
}

/// What a `D3D_SHADER_INPUT_TYPE` is bound as.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ResourceKind {
    Cbuffer,
    Tbuffer,
    Texture,
    Sampler,
    Structured,
    Other(u32),
}

impl ResourceKind {
    fn of(raw: u32) -> Self {
        match raw {
            0 => Self::Cbuffer,
            1 => Self::Tbuffer,
            2 => Self::Texture,
            3 => Self::Sampler,
            5 => Self::Structured,
            other => Self::Other(other),
        }
    }

    /// The register file dxbc-spirv names a variable of this kind by: `t` for every shader
    /// resource view, `s` for samplers and `cb` for constant buffers.
    #[must_use]
    pub fn register_prefix(self) -> &'static str {
        match self {
            Self::Cbuffer => "cb",
            Self::Sampler => "s",
            _ => "t",
        }
    }
}

/// A `D3D_SRV_DIMENSION`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Dimension {
    Unknown,
    Buffer,
    Texture1d,
    Texture1dArray,
    Texture2d,
    Texture2dArray,
    Texture3d,
    Cube,
    CubeArray,
    Other(u32),
}

impl Dimension {
    fn of(raw: u32) -> Self {
        match raw {
            0 => Self::Unknown,
            1 => Self::Buffer,
            2 => Self::Texture1d,
            3 => Self::Texture1dArray,
            4 => Self::Texture2d,
            5 => Self::Texture2dArray,
            8 => Self::Texture3d,
            9 => Self::Cube,
            10 => Self::CubeArray,
            other => Self::Other(other),
        }
    }
}

/// One constant buffer with every member's byte offset, as the blob was compiled.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConstantBuffer {
    pub name: String,
    /// The buffer's size in bytes, a multiple of 16.
    pub size: u32,
    /// The `cb` register, which `RDEF`'s resource table carries under the same name.
    pub bind: Option<u32>,
    pub members: Vec<Member>,
}

/// One member of a constant buffer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Member {
    pub name: String,
    /// The byte offset in the buffer.
    pub offset: u32,
    /// The member's size in bytes.
    pub size: u32,
    /// Whether this permutation reads it. An unread member is compiled out of the code and
    /// is not an error when a material writes it.
    pub used: bool,
    pub ty: MemberType,
}

/// The type of a constant buffer member, enough to pick the view that writes it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemberType {
    pub scalar: Scalar,
    pub rows: u16,
    pub columns: u16,
    /// Array length, or zero for a scalar, vector or matrix that is no array.
    pub elements: u16,
    pub class: TypeClass,
}

/// A `D3D_SHADER_VARIABLE_TYPE`, reduced to what a byte view distinguishes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Scalar {
    Bool,
    Int,
    Uint,
    Float,
    Other(u16),
}

/// A `D3D_SHADER_VARIABLE_CLASS`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TypeClass {
    Scalar,
    Vector,
    MatrixRows,
    MatrixColumns,
    Object,
    Struct,
    Other(u16),
}

/// One entry of an input or output signature.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SignatureEntry {
    /// The semantic name, without its index.
    pub semantic: String,
    pub index: u32,
    /// The system value, or zero for a user semantic.
    pub system_value: u32,
    pub register: u32,
    /// Which of `xyzw` the entry occupies, as a four-bit mask.
    pub mask: u8,
    /// Which components the shader reads or writes, as a four-bit mask.
    pub used: u8,
}

impl SignatureEntry {
    /// The semantic and its index as HLSL writes it: `TEXCOORD0`.
    #[must_use]
    pub fn label(&self) -> String {
        format!("{}{}", self.semantic, self.index)
    }
}

/// Everything a binding reads off a blob.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Reflection {
    pub shader_model: (u8, u8),
    pub resources: Vec<Resource>,
    pub constant_buffers: Vec<ConstantBuffer>,
    pub inputs: Vec<SignatureEntry>,
    pub outputs: Vec<SignatureEntry>,
}

impl Reflection {
    /// The resource bound at `bind` of `kind`, by name.
    #[must_use]
    pub fn resource(&self, kind: ResourceKind, bind: u32) -> Option<&Resource> {
        self.resources
            .iter()
            .find(|resource| resource.kind == kind && resource.bind == bind)
    }

    /// The shader resource view at `t<bind>`, of whichever kind sits there.
    #[must_use]
    pub fn view(&self, bind: u32) -> Option<&Resource> {
        self.resources.iter().find(|resource| {
            resource.bind == bind
                && matches!(
                    resource.kind,
                    ResourceKind::Texture | ResourceKind::Structured | ResourceKind::Tbuffer
                )
        })
    }
}

/// The bytes of the container that its own size field counts.
///
/// A bundle record is the container plus one byte the size field does not cover, and the
/// D3D tools refuse the untrimmed record.
///
/// # Errors
///
/// Fails when `bytes` does not start with the `DXBC` magic or is shorter than its size
/// field claims.
pub fn trimmed(bytes: &[u8]) -> Result<&[u8], ContainerError> {
    if bytes.len() < CHUNK_TABLE_OFFSET || &bytes[..4] != MAGIC {
        return Err(ContainerError::NotDxbc);
    }
    let size = u32_at(bytes, SIZE_OFFSET)? as usize;
    bytes
        .get(..size)
        .ok_or(ContainerError::Truncated { at: size })
}

/// The reflection chunks of one container.
///
/// # Errors
///
/// Fails when `bytes` is no container, is truncated, or lacks an `RDEF` chunk. A missing
/// signature chunk reads as empty, since a pixel shader can write nothing.
pub fn reflect(bytes: &[u8]) -> Result<Reflection, ContainerError> {
    let chunks = chunks(bytes)?;
    let rdef = chunks
        .get(b"RDEF")
        .ok_or(ContainerError::MissingChunk { chunk: "RDEF" })?;
    let (shader_model, resources, constant_buffers) = read_rdef(rdef)?;
    let inputs = match chunks.get(b"ISGN") {
        Some(chunk) => read_signature(chunk)?,
        None => Vec::new(),
    };
    let outputs = match chunks.get(b"OSGN") {
        Some(chunk) => read_signature(chunk)?,
        None => Vec::new(),
    };
    Ok(Reflection {
        shader_model,
        resources,
        constant_buffers,
        inputs,
        outputs,
    })
}

fn chunks(bytes: &[u8]) -> Result<HashMap<[u8; 4], &[u8]>, ContainerError> {
    let bytes = trimmed(bytes)?;
    let count = u32_at(bytes, CHUNK_COUNT_OFFSET)? as usize;
    let mut chunks = HashMap::with_capacity(count);
    for index in 0..count {
        let offset = u32_at(bytes, CHUNK_TABLE_OFFSET + 4 * index)? as usize;
        let tag: [u8; 4] = bytes
            .get(offset..offset + 4)
            .ok_or(ContainerError::Truncated { at: offset })?
            .try_into()
            .expect("four bytes were taken");
        let size = u32_at(bytes, offset + 4)? as usize;
        let body = bytes
            .get(offset + 8..offset + 8 + size)
            .ok_or(ContainerError::Truncated { at: offset + 8 })?;
        chunks.insert(tag, body);
    }
    Ok(chunks)
}

type Rdef = ((u8, u8), Vec<Resource>, Vec<ConstantBuffer>);

fn read_rdef(chunk: &[u8]) -> Result<Rdef, ContainerError> {
    let cbuffer_count = u32_at(chunk, 0)? as usize;
    let cbuffer_offset = u32_at(chunk, 4)? as usize;
    let resource_count = u32_at(chunk, 8)? as usize;
    let resource_offset = u32_at(chunk, 12)? as usize;
    let minor = *chunk.get(16).ok_or(ContainerError::Truncated { at: 16 })?;
    let major = *chunk.get(17).ok_or(ContainerError::Truncated { at: 17 })?;

    /* SM 5 containers carry an `RD11` header that spells out its record sizes. SM 4 ones
    have the fixed sizes. */
    let (resource_stride, variable_stride) = if chunk.get(28..32) == Some(b"RD11") {
        (u32_at(chunk, 40)? as usize, u32_at(chunk, 44)? as usize)
    } else {
        (32, 24)
    };

    let mut resources = Vec::with_capacity(resource_count);
    for index in 0..resource_count {
        let at = resource_offset + index * resource_stride;
        resources.push(Resource {
            name: cstr_at(chunk, u32_at(chunk, at)? as usize)?,
            kind: ResourceKind::of(u32_at(chunk, at + 4)?),
            dimension: Dimension::of(u32_at(chunk, at + 12)?),
            bind: u32_at(chunk, at + 20)?,
            count: u32_at(chunk, at + 24)?,
        });
    }

    let mut constant_buffers = Vec::with_capacity(cbuffer_count);
    for index in 0..cbuffer_count {
        let at = cbuffer_offset + index * 24;
        let name = cstr_at(chunk, u32_at(chunk, at)? as usize)?;
        let variable_count = u32_at(chunk, at + 4)? as usize;
        let variable_offset = u32_at(chunk, at + 8)? as usize;
        let size = u32_at(chunk, at + 12)?;

        let mut members = Vec::with_capacity(variable_count);
        for variable in 0..variable_count {
            let at = variable_offset + variable * variable_stride;
            members.push(Member {
                name: cstr_at(chunk, u32_at(chunk, at)? as usize)?,
                offset: u32_at(chunk, at + 4)?,
                size: u32_at(chunk, at + 8)?,
                used: u32_at(chunk, at + 12)? & 2 != 0,
                ty: read_type(chunk, u32_at(chunk, at + 16)? as usize)?,
            });
        }

        let bind = resources
            .iter()
            .find(|resource| {
                matches!(resource.kind, ResourceKind::Cbuffer | ResourceKind::Tbuffer)
                    && resource.name == name
            })
            .map(|resource| resource.bind);
        constant_buffers.push(ConstantBuffer {
            name,
            size,
            bind,
            members,
        });
    }

    Ok(((major, minor), resources, constant_buffers))
}

fn read_type(chunk: &[u8], at: usize) -> Result<MemberType, ContainerError> {
    let class = u16_at(chunk, at)?;
    let scalar = u16_at(chunk, at + 2)?;
    Ok(MemberType {
        class: match class {
            0 => TypeClass::Scalar,
            1 => TypeClass::Vector,
            2 => TypeClass::MatrixRows,
            3 => TypeClass::MatrixColumns,
            4 => TypeClass::Object,
            5 => TypeClass::Struct,
            other => TypeClass::Other(other),
        },
        scalar: match scalar {
            1 => Scalar::Bool,
            2 => Scalar::Int,
            3 => Scalar::Float,
            19 => Scalar::Uint,
            other => Scalar::Other(other),
        },
        rows: u16_at(chunk, at + 4)?,
        columns: u16_at(chunk, at + 6)?,
        elements: u16_at(chunk, at + 8)?,
    })
}

fn read_signature(chunk: &[u8]) -> Result<Vec<SignatureEntry>, ContainerError> {
    let count = u32_at(chunk, 0)? as usize;
    let mut entries = Vec::with_capacity(count);
    for index in 0..count {
        let at = 8 + index * 24;
        entries.push(SignatureEntry {
            semantic: cstr_at(chunk, u32_at(chunk, at)? as usize)?,
            index: u32_at(chunk, at + 4)?,
            system_value: u32_at(chunk, at + 8)?,
            register: u32_at(chunk, at + 16)?,
            mask: *chunk
                .get(at + 20)
                .ok_or(ContainerError::Truncated { at: at + 20 })?,
            used: *chunk
                .get(at + 21)
                .ok_or(ContainerError::Truncated { at: at + 21 })?,
        });
    }
    Ok(entries)
}

fn u32_at(bytes: &[u8], at: usize) -> Result<u32, ContainerError> {
    bytes
        .get(at..at + 4)
        .map(|word| u32::from_le_bytes(word.try_into().expect("four bytes were taken")))
        .ok_or(ContainerError::Truncated { at })
}

fn u16_at(bytes: &[u8], at: usize) -> Result<u16, ContainerError> {
    bytes
        .get(at..at + 2)
        .map(|half| u16::from_le_bytes(half.try_into().expect("two bytes were taken")))
        .ok_or(ContainerError::Truncated { at })
}

fn cstr_at(bytes: &[u8], at: usize) -> Result<String, ContainerError> {
    let tail = bytes.get(at..).ok_or(ContainerError::Truncated { at })?;
    let end = tail
        .iter()
        .position(|&byte| byte == 0)
        .ok_or(ContainerError::Truncated { at })?;
    Ok(String::from_utf8_lossy(&tail[..end]).into_owned())
}

#[cfg(test)]
pub(crate) mod tests;

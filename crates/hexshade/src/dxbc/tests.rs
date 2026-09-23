use super::*;

/// A bytes builder that hands out the offset of what it appends.
#[derive(Default)]
struct Bytes(Vec<u8>);

impl Bytes {
    fn u32(&mut self, value: u32) -> &mut Self {
        self.0.extend(value.to_le_bytes());
        self
    }

    fn u16(&mut self, value: u16) -> &mut Self {
        self.0.extend(value.to_le_bytes());
        self
    }

    fn u8(&mut self, value: u8) -> &mut Self {
        self.0.push(value);
        self
    }

    fn str(&mut self, text: &str) -> u32 {
        let at = self.0.len() as u32;
        self.0.extend(text.as_bytes());
        self.0.push(0);
        at
    }
}

/// An `RDEF` with `$Globals` (`Tint` float4 at 0, `Time` float at 16, unused), a
/// `PerFrameVertexCB` (`mProj` float4x4 at 0), `Diffuse_Texture__TX` at t2, a structured
/// `CLUSTER_DATA` at t0, and `Diffuse_Texture__SMP` at s1.
fn rdef() -> Vec<u8> {
    const HEADER: u32 = 60;
    const RESOURCE: u32 = 40;
    const CBUFFER: u32 = 24;
    const VARIABLE: u32 = 40;
    const TYPE: u32 = 36;
    let resources_at = HEADER;
    let cbuffers_at = resources_at + 5 * RESOURCE;
    let variables_at = cbuffers_at + 2 * CBUFFER;
    let types_at = variables_at + 3 * VARIABLE;
    let strings_at = types_at + 3 * TYPE;

    let mut strings = Bytes::default();
    let globals = strings_at + strings.str("$Globals");
    let per_frame = strings_at + strings.str("PerFrameVertexCB");
    let diffuse = strings_at + strings.str("Diffuse_Texture__TX");
    let cluster = strings_at + strings.str("CLUSTER_DATA");
    let sampler = strings_at + strings.str("Diffuse_Texture__SMP");
    let tint = strings_at + strings.str("Tint");
    let time = strings_at + strings.str("Time");
    let proj = strings_at + strings.str("mProj");

    let mut b = Bytes::default();
    b.u32(2).u32(cbuffers_at).u32(5).u32(resources_at);
    b.u8(0).u8(5).u16(1).u32(0).u32(0);
    b.0.extend(b"RD11");
    b.u32(HEADER)
        .u32(CBUFFER)
        .u32(RESOURCE)
        .u32(VARIABLE)
        .u32(TYPE)
        .u32(12)
        .u32(0);
    assert_eq!(b.0.len() as u32, resources_at);

    let mut resource = |name: u32, kind: u32, dimension: u32, bind: u32| {
        b.u32(name)
            .u32(kind)
            .u32(0)
            .u32(dimension)
            .u32(0)
            .u32(bind)
            .u32(1)
            .u32(0);
        b.u32(0).u32(0);
    };
    resource(globals, 0, 0, 0);
    resource(per_frame, 0, 0, 1);
    resource(diffuse, 2, 4, 2);
    resource(cluster, 5, 1, 0);
    resource(sampler, 3, 0, 1);
    assert_eq!(b.0.len() as u32, cbuffers_at);

    b.u32(globals)
        .u32(2)
        .u32(variables_at)
        .u32(32)
        .u32(0)
        .u32(0);
    b.u32(per_frame)
        .u32(1)
        .u32(variables_at + 2 * VARIABLE)
        .u32(560)
        .u32(0)
        .u32(0);
    assert_eq!(b.0.len() as u32, variables_at);

    let mut variable = |name: u32, offset: u32, size: u32, used: bool, ty: u32| {
        b.u32(name)
            .u32(offset)
            .u32(size)
            .u32(if used { 2 } else { 0 })
            .u32(ty);
        b.u32(0).u32(0).u32(0).u32(0).u32(0);
    };
    variable(tint, 0, 16, true, types_at);
    variable(time, 16, 4, false, types_at + TYPE);
    variable(proj, 0, 64, true, types_at + 2 * TYPE);
    assert_eq!(b.0.len() as u32, types_at);

    let mut ty = |class: u16, scalar: u16, rows: u16, columns: u16| {
        b.u16(class)
            .u16(scalar)
            .u16(rows)
            .u16(columns)
            .u16(0)
            .u16(0)
            .u32(0);
        b.u32(0).u32(0).u32(0).u32(0).u32(0);
    };
    ty(1, 3, 1, 4);
    ty(0, 3, 1, 1);
    ty(3, 3, 4, 4);
    assert_eq!(b.0.len() as u32, strings_at);

    b.0.extend(strings.0);
    b.0
}

fn signature(entries: &[(&str, u32, u32, u8)]) -> Vec<u8> {
    let mut b = Bytes::default();
    b.u32(entries.len() as u32).u32(8);
    let strings_at = 8 + 24 * entries.len() as u32;
    let mut strings = Bytes::default();
    for (semantic, index, register, mask) in entries {
        let name = strings_at + strings.str(semantic);
        b.u32(name).u32(*index).u32(0).u32(3).u32(*register);
        b.u8(*mask).u8(*mask).u16(0);
    }
    b.0.extend(strings.0);
    b.0
}

/// A container with the `RDEF` above, an `ISGN` of `POSITION0` and `TEXCOORD0`, and an
/// `OSGN` of `SV_Position` and `TEXCOORD0`.
pub(crate) fn container() -> Vec<u8> {
    let chunks: [(&[u8; 4], Vec<u8>); 3] = [
        (b"RDEF", rdef()),
        (
            b"ISGN",
            signature(&[("POSITION", 0, 0, 0b0111), ("TEXCOORD", 0, 1, 0b0011)]),
        ),
        (
            b"OSGN",
            signature(&[("SV_Position", 0, 0, 0b1111), ("TEXCOORD", 0, 1, 0b0011)]),
        ),
    ];
    let table_at = 32;
    let mut at = table_at + 4 * chunks.len() as u32;
    let mut offsets = Vec::new();
    for (_, body) in &chunks {
        offsets.push(at);
        at += 8 + body.len() as u32;
    }

    let mut b = Bytes::default();
    b.0.extend(b"DXBC");
    b.0.extend([0u8; 16]);
    b.u32(1).u32(at).u32(chunks.len() as u32);
    for offset in offsets {
        b.u32(offset);
    }
    for (tag, body) in chunks {
        b.0.extend(tag);
        b.u32(body.len() as u32);
        b.0.extend(body);
    }
    b.0
}

#[test]
fn the_trim_keeps_what_the_size_field_counts() {
    let blob = container();
    let mut padded = blob.clone();
    padded.push(0x35);
    assert_eq!(trimmed(&padded).unwrap(), blob.as_slice());
    assert_eq!(trimmed(b"XXXX").unwrap_err(), ContainerError::NotDxbc);
    assert_eq!(
        trimmed(&blob[..blob.len() - 1]).unwrap_err(),
        ContainerError::Truncated { at: blob.len() }
    );
}

#[test]
fn constant_buffers_carry_their_members_at_their_offsets() {
    let reflection = reflect(&container()).unwrap();
    assert_eq!(reflection.shader_model, (5, 0));

    let globals = &reflection.constant_buffers[0];
    assert_eq!(globals.name, "$Globals");
    assert_eq!(globals.size, 32);
    assert_eq!(globals.bind, Some(0));
    assert_eq!(globals.members.len(), 2);
    assert_eq!(globals.members[0].name, "Tint");
    assert_eq!(globals.members[0].offset, 0);
    assert!(globals.members[0].used);
    assert_eq!(globals.members[0].ty.class, TypeClass::Vector);
    assert_eq!(globals.members[0].ty.columns, 4);
    assert_eq!(globals.members[1].name, "Time");
    assert_eq!(globals.members[1].offset, 16);
    assert!(!globals.members[1].used);

    let per_frame = &reflection.constant_buffers[1];
    assert_eq!(per_frame.name, "PerFrameVertexCB");
    assert_eq!(per_frame.size, 560);
    assert_eq!(per_frame.bind, Some(1));
    assert_eq!(per_frame.members[0].ty.class, TypeClass::MatrixColumns);
    assert_eq!(per_frame.members[0].ty.rows, 4);
}

#[test]
fn resources_are_found_by_kind_and_register() {
    let reflection = reflect(&container()).unwrap();
    let texture = reflection.resource(ResourceKind::Texture, 2).unwrap();
    assert_eq!(texture.name, "Diffuse_Texture__TX");
    assert_eq!(texture.dimension, Dimension::Texture2d);
    assert_eq!(reflection.view(2).unwrap().name, "Diffuse_Texture__TX");
    assert_eq!(reflection.view(0).unwrap().name, "CLUSTER_DATA");
    assert_eq!(reflection.view(0).unwrap().kind, ResourceKind::Structured);
    assert_eq!(
        reflection.resource(ResourceKind::Sampler, 1).unwrap().name,
        "Diffuse_Texture__SMP"
    );
    assert!(reflection.resource(ResourceKind::Sampler, 0).is_none());
    assert!(reflection.view(9).is_none());
}

#[test]
fn signatures_carry_semantics_registers_and_masks() {
    let reflection = reflect(&container()).unwrap();
    assert_eq!(reflection.inputs.len(), 2);
    assert_eq!(reflection.inputs[0].label(), "POSITION0");
    assert_eq!(reflection.inputs[0].register, 0);
    assert_eq!(reflection.inputs[0].mask, 0b0111);
    assert_eq!(reflection.inputs[1].label(), "TEXCOORD0");
    assert_eq!(reflection.inputs[1].register, 1);
    assert_eq!(reflection.outputs[0].semantic, "SV_Position");
    assert_eq!(reflection.outputs[1].used, 0b0011);
}

#[test]
fn a_container_without_reflection_is_refused() {
    let mut b = Bytes::default();
    b.0.extend(b"DXBC");
    b.0.extend([0u8; 16]);
    b.u32(1).u32(32).u32(0);
    assert_eq!(
        reflect(&b.0).unwrap_err(),
        ContainerError::MissingChunk { chunk: "RDEF" }
    );
}

//! Write the starting values of the VFX templates as clipboard text.
//!
//! ```text
//! cargo run -p ltk-manager-core --example vfx_template_values
//! ```
//!
//! The files land in `src/vfx/templates/`, which the catalog reads. The values are a first
//! draft that an author tunes in the app and saves back through Copy emitter, after which
//! this generator goes. "First batch" in docs/plans/vfx-templates.md.

use std::path::Path;

use fs_err as fs;
use glam::{Vec2, Vec3, Vec4};
use ltk_hash::{BinHash, Hash as _};
use ltk_manager_bin::bin_document::clipboard_text;
use ltk_meta::PropertyValueEnum as Value;
use ltk_meta::property::{Kind, values};

const ADD: u8 = 4;
const ALPHA: u8 = 1;

const PARTICLES: &str = "assets/shared/particles/";

fn main() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/vfx/templates");
    fs::create_dir_all(root.join("emitters")).expect("the emitters folder is made");
    fs::create_dir_all(root.join("systems")).expect("the systems folder is made");

    let emitters = [
        ("glow", glow("Glow")),
        ("sparks", sparks("Sparks")),
        ("smoke_puff", smoke("Smoke")),
        ("shockwave_ring", shockwave("Shockwave")),
        ("trail", trail("Trail")),
        ("distortion", distortion("Distortion")),
    ];
    for (id, emitter) in emitters {
        let text = clipboard_text(&emitter.into(), Some("VfxEmitterDefinitionData"));
        fs::write(
            root.join("emitters").join(format!("{id}.json")),
            text + "\n",
        )
        .expect("the emitter template is written");
    }

    let systems = [
        ("explosion", explosion()),
        ("missile", missile()),
        ("aura", aura()),
    ];
    for (id, system) in systems {
        let text = clipboard_text(&system.into(), Some("VfxSystemDefinitionData"));
        fs::write(root.join("systems").join(format!("{id}.json")), text + "\n")
            .expect("the system template is written");
    }
}

// --- Emitters ---------------------------------------------------------------------------

fn glow(name: &str) -> values::Struct {
    emitter(
        name,
        vec![
            ("isSingleParticle", flag()),
            ("rate", float(1.0)),
            ("lifetime", some(0.5)),
            ("particleLifetime", float(0.5)),
            ("primitive", pointer("VfxPrimitiveCameraQuad", vec![])),
            ("texture", texture("common_bigglow.tex")),
            ("blendMode", byte(ADD)),
            ("birthScale0", vector3(120.0, 120.0, 120.0)),
            ("scale0", vector3_keys(&[0.0, 1.0], &[[0.6; 3], [1.2; 3]])),
            ("birthColor", color(1.0, 0.85, 0.6, 1.0)),
            ("Color", fade_in_out(0.2)),
        ],
    )
}

fn sparks(name: &str) -> values::Struct {
    emitter(
        name,
        vec![
            ("rate", float(600.0)),
            ("lifetime", some(0.05)),
            ("particleLifetime", float_random(0.45, 0.66, 1.33)),
            ("primitive", pointer("VfxPrimitiveRay", vec![])),
            ("texture", texture("base_brightspark.tex")),
            ("blendMode", byte(ADD)),
            (
                "SpawnShape",
                pointer("VfxShapeSphere", vec![("radius", f32(10.0))]),
            ),
            (
                "birthVelocity",
                vector3_random(
                    [500.0, 500.0, 500.0],
                    [(-1.0, 1.0), (-0.2, 1.0), (-1.0, 1.0)],
                ),
            ),
            ("drag", vector3(2.0, 2.0, 2.0)),
            ("worldAcceleration", integrated_vector3(0.0, -900.0, 0.0)),
            ("birthScale0", vector3(8.0, 50.0, 8.0)),
            ("scale0", vector3_keys(&[0.0, 1.0], &[[1.0; 3], [0.3; 3]])),
            ("birthColor", color(1.0, 0.8, 0.45, 1.0)),
            ("Color", fade_out(0.7)),
        ],
    )
}

fn smoke(name: &str) -> values::Struct {
    emitter(
        name,
        vec![
            ("rate", float(40.0)),
            ("lifetime", some(0.2)),
            ("particleLifetime", float_random(1.4, 0.8, 1.2)),
            ("primitive", pointer("VfxPrimitiveCameraQuad", vec![])),
            ("texture", texture("smoke_clouds_2x2_hc.tex")),
            ("texDiv", vector2(2.0, 2.0)),
            ("numFrames", word(4)),
            ("isRandomStartFrame", flag()),
            ("blendMode", byte(ALPHA)),
            (
                "SpawnShape",
                pointer(
                    "VfxShapeSphere",
                    vec![("radius", f32(40.0)), ("flags", byte(1))],
                ),
            ),
            (
                "birthVelocity",
                vector3_random([30.0, 80.0, 30.0], [(-1.0, 1.0), (0.5, 1.5), (-1.0, 1.0)]),
            ),
            ("drag", vector3(1.5, 1.5, 1.5)),
            (
                "birthRotation0",
                vector3_random([180.0, 0.0, 0.0], [(-1.0, 1.0), FIXED, FIXED]),
            ),
            (
                "birthRotationalVelocity0",
                vector3_random([20.0, 0.0, 0.0], [(-1.0, 1.0), FIXED, FIXED]),
            ),
            ("birthScale0", vector3(140.0, 140.0, 140.0)),
            ("scale0", vector3_keys(&[0.0, 1.0], &[[0.7; 3], [1.6; 3]])),
            ("birthColor", color(0.35, 0.33, 0.32, 1.0)),
            ("Color", color_keys(&[0.0, 0.15, 1.0], &[0.0, 0.7, 0.0])),
            (
                "alphaErosionDefinition",
                pointer(
                    "VfxAlphaErosionDefinitionData",
                    vec![
                        (
                            "erosionDriveCurve",
                            float_keys(&[0.0, 0.5, 1.0], &[0.0, 0.1, 1.0]),
                        ),
                        ("erosionFeatherIn", f32(0.2)),
                        ("erosionFeatherOut", f32(0.2)),
                        ("erosionMapName", texture("base_smokeerode.tex")),
                    ],
                ),
            ),
        ],
    )
}

fn shockwave(name: &str) -> values::Struct {
    emitter(
        name,
        vec![
            ("isSingleParticle", flag()),
            ("rate", float(1.0)),
            ("lifetime", some(0.35)),
            ("particleLifetime", float(0.35)),
            ("primitive", pointer("VfxPrimitiveArbitraryQuad", vec![])),
            ("isGroundLayer", flag()),
            ("birthRotation0", vector3(90.0, 0.0, 0.0)),
            ("texture", texture("blast_ring_16.tex")),
            ("blendMode", byte(ADD)),
            ("birthScale0", vector3(450.0, 450.0, 450.0)),
            (
                "scale0",
                vector3_keys(&[0.0, 0.3, 1.0], &[[0.0; 3], [0.75; 3], [1.0; 3]]),
            ),
            ("birthColor", color(1.0, 0.75, 0.45, 1.0)),
            ("Color", color_keys(&[0.0, 0.6, 1.0], &[1.0, 0.6, 0.0])),
        ],
    )
}

fn trail(name: &str) -> values::Struct {
    emitter(
        name,
        vec![
            ("rate", float(60.0)),
            ("particleLifetime", float(0.3)),
            (
                "primitive",
                pointer(
                    "VfxPrimitiveCameraTrail",
                    vec![(
                        "mTrail",
                        embed(
                            "VfxTrailDefinitionData",
                            vec![
                                ("mMode", byte(0)),
                                ("mBirthTilingSize", vector3(300.0, 0.0, 0.0)),
                                ("mCutoff", f32(0.0)),
                                ("mMaxAddedPerFrame", int(0)),
                                ("mSmoothingMode", byte(0)),
                            ],
                        ),
                    )],
                ),
            ),
            ("texture", texture("base_trail_01.tex")),
            ("blendMode", byte(ADD)),
            ("birthScale0", vector3(40.0, 40.0, 40.0)),
            ("birthColor", color(0.6, 0.85, 1.0, 1.0)),
            ("Color", fade_out(0.0)),
        ],
    )
}

/// A warp of what is behind it. The game's `DISTORTION_PS` multiplies the frame by the
/// texture, so the texture is white, and takes its coverage from the normal map's alpha, so
/// the map carries one.
fn distortion(name: &str) -> values::Struct {
    emitter(
        name,
        vec![
            ("isSingleParticle", flag()),
            ("rate", float(1.0)),
            ("lifetime", some(0.4)),
            ("particleLifetime", float(0.4)),
            ("primitive", pointer("VfxPrimitiveCameraQuad", vec![])),
            ("texture", texture("white.tex")),
            ("blendMode", byte(ADD)),
            ("birthScale0", vector3(200.0, 200.0, 200.0)),
            ("scale0", vector3_keys(&[0.0, 1.0], &[[0.3; 3], [1.2; 3]])),
            ("Color", fade_out(0.0)),
            (
                "distortionDefinition",
                pointer(
                    "VfxDistortionDefinitionData",
                    vec![
                        ("distortion", f32(0.03)),
                        ("distortionMode", byte(1)),
                        ("normalMapTexture", texture("base_circle_normal.tex")),
                    ],
                ),
            ),
        ],
    )
}

fn fire(name: &str) -> values::Struct {
    emitter(
        name,
        vec![
            ("rate", float(240.0)),
            ("lifetime", some(0.05)),
            ("particleLifetime", float_random(0.6, 0.8, 1.2)),
            ("primitive", pointer("VfxPrimitiveCameraQuad", vec![])),
            ("texture", texture("global_ss_ignite_fire.tex")),
            ("blendMode", byte(ADD)),
            (
                "SpawnShape",
                pointer("VfxShapeSphere", vec![("radius", f32(30.0))]),
            ),
            (
                "birthVelocity",
                vector3_random(
                    [150.0, 150.0, 150.0],
                    [(-1.0, 1.0), (0.0, 1.0), (-1.0, 1.0)],
                ),
            ),
            ("drag", vector3(3.0, 3.0, 3.0)),
            (
                "birthRotation0",
                vector3_random([180.0, 0.0, 0.0], [(-1.0, 1.0), FIXED, FIXED]),
            ),
            ("birthScale0", vector3(120.0, 120.0, 120.0)),
            ("scale0", vector3_keys(&[0.0, 1.0], &[[1.0; 3], [0.35; 3]])),
            ("birthColor", color(1.0, 0.7, 0.3, 1.0)),
            (
                "Color",
                colors(
                    &[0.0, 0.5, 1.0],
                    &[
                        [1.0, 1.0, 1.0, 1.0],
                        [1.0, 0.5, 0.3, 0.8],
                        [0.6, 0.2, 0.1, 0.0],
                    ],
                ),
            ),
        ],
    )
}

fn decal(name: &str, file: &str, blend: u8, life: f32) -> values::Struct {
    emitter(
        name,
        vec![
            ("isSingleParticle", flag()),
            ("rate", float(1.0)),
            ("lifetime", some(life)),
            ("particleLifetime", float(life)),
            ("primitive", pointer("VfxPrimitiveArbitraryQuad", vec![])),
            ("isGroundLayer", flag()),
            ("birthRotation0", vector3(90.0, 0.0, 0.0)),
            ("texture", texture(file)),
            ("blendMode", byte(blend)),
            ("birthScale0", vector3(300.0, 300.0, 300.0)),
            (
                "Color",
                color_keys(&[0.0, 0.1, 0.7, 1.0], &[0.0, 1.0, 1.0, 0.0]),
            ),
        ],
    )
}

fn motes(name: &str, rate: f32) -> values::Struct {
    emitter(
        name,
        vec![
            ("rate", float(rate)),
            ("particleLifetime", float_random(1.5, 0.66, 1.33)),
            ("primitive", pointer("VfxPrimitiveCameraQuad", vec![])),
            ("texture", texture("base_dot.tex")),
            ("blendMode", byte(ADD)),
            (
                "SpawnShape",
                pointer(
                    "VfxShapeSphere",
                    vec![("radius", f32(80.0)), ("flags", byte(1))],
                ),
            ),
            (
                "birthVelocity",
                vector3_random([15.0, 100.0, 15.0], [(-1.0, 1.0), (0.6, 1.4), (-1.0, 1.0)]),
            ),
            ("birthScale0", vector3(12.0, 12.0, 12.0)),
            ("birthColor", color(1.0, 0.9, 0.6, 1.0)),
            ("Color", fade_in_out(0.2)),
        ],
    )
}

// --- Systems ----------------------------------------------------------------------------

fn explosion() -> values::Struct {
    let flash = with(
        glow("Flash"),
        vec![
            ("birthScale0", vector3(320.0, 320.0, 320.0)),
            ("particleLifetime", float(0.25)),
            ("lifetime", some(0.25)),
        ],
    );
    let debris = with(sparks("Sparks"), vec![("rate", float(800.0))]);
    let smoke = with(
        smoke("Smoke"),
        vec![
            ("timeBeforeFirstEmission", f32(0.08)),
            ("particleLifetime", float_random(1.5, 0.8, 1.2)),
        ],
    );
    let heat = with(
        distortion("Heat"),
        vec![("birthScale0", vector3(420.0, 420.0, 420.0))],
    );
    let scorch = decal("Scorch", "explosion_groundburn.tex", ALPHA, 2.0);

    system(
        "Explosion",
        vec![
            flash,
            fire("Fireball"),
            debris,
            smoke,
            shockwave("Shockwave"),
            heat,
            scorch,
        ],
    )
}

fn missile() -> values::Struct {
    let core = with(
        glow("Core"),
        vec![
            ("isSingleParticle", flag_off()),
            ("rate", float(30.0)),
            ("lifetime", none()),
            ("particleLifetime", float(0.15)),
            ("birthScale0", vector3(90.0, 90.0, 90.0)),
            ("bindWeight", float(1.0)),
            ("Color", fade_out(0.5)),
        ],
    );
    let shed = with(
        motes("Motes", 25.0),
        vec![
            ("particleLifetime", float_random(0.5, 0.6, 1.4)),
            (
                "birthVelocity",
                vector3_random([60.0, 60.0, 60.0], [(-1.0, 1.0), (-1.0, 1.0), (-1.0, 1.0)]),
            ),
            (
                "SpawnShape",
                pointer(
                    "VfxShapeSphere",
                    vec![("radius", f32(20.0)), ("flags", byte(1))],
                ),
            ),
        ],
    );
    let heat = with(
        distortion("Heat"),
        vec![
            ("isSingleParticle", flag_off()),
            ("rate", float(10.0)),
            ("lifetime", none()),
            ("particleLifetime", float(0.3)),
            ("birthScale0", vector3(120.0, 120.0, 120.0)),
            ("bindWeight", float(1.0)),
        ],
    );

    system("Missile", vec![core, trail("Trail"), shed, heat])
}

fn aura() -> values::Struct {
    let ring = with(
        decal("Ring", "vs_outerring.tex", ADD, 1.0),
        vec![
            ("isSingleParticle", flag_off()),
            ("rate", float(1.0)),
            ("lifetime", none()),
            ("particleLifetime", float(1.0)),
            ("birthScale0", vector3(260.0, 260.0, 260.0)),
            ("birthColor", color(0.5, 0.8, 1.0, 1.0)),
        ],
    );
    let body = with(
        glow("Body"),
        vec![
            ("isSingleParticle", flag_off()),
            ("rate", float(4.0)),
            ("lifetime", none()),
            ("particleLifetime", float(1.0)),
            ("birthScale0", vector3(220.0, 220.0, 220.0)),
            ("birthColor", color(0.5, 0.8, 1.0, 0.6)),
            ("bindWeight", float(1.0)),
            (
                "SpawnShape",
                pointer(
                    "VfxShapeLegacy",
                    vec![("emitOffset", vector3(0.0, 100.0, 0.0))],
                ),
            ),
        ],
    );
    let rising = with(
        motes("Motes", 12.0),
        vec![("birthColor", color(0.6, 0.9, 1.0, 1.0))],
    );

    system("Aura", vec![ring, rising, body])
}

// --- Builders ---------------------------------------------------------------------------

/// A table that multiplies a channel's draw by one.
const FIXED: (f32, f32) = (1.0, 1.0);

fn h(name: &str) -> BinHash {
    BinHash::hash_str(name)
}

fn object(class: &str, fields: Vec<(&str, Value)>) -> values::Struct {
    values::Struct {
        class_hash: h(class),
        properties: fields
            .into_iter()
            .map(|(name, value)| (h(name), value))
            .collect(),
    }
}

fn emitter(name: &str, mut fields: Vec<(&str, Value)>) -> values::Struct {
    fields.insert(0, ("emitterName", text(name)));
    object("VfxEmitterDefinitionData", fields)
}

/// `base` with `fields` written over it, a field it lacks appended.
fn with(mut base: values::Struct, fields: Vec<(&str, Value)>) -> values::Struct {
    for (name, value) in fields {
        base.properties.insert(h(name), value);
    }
    base
}

fn system(name: &str, emitters: Vec<values::Struct>) -> values::Struct {
    let list = values::Container::new(
        Kind::Struct,
        emitters.into_iter().map(Value::from).collect(),
    )
    .expect("every emitter is a pointer");
    object(
        "VfxSystemDefinitionData",
        vec![
            ("particleName", text(name)),
            ("particlePath", text(name)),
            ("complexEmitterDefinitionData", list.into()),
        ],
    )
}

fn pointer(class: &str, fields: Vec<(&str, Value)>) -> Value {
    object(class, fields).into()
}

fn embed(class: &str, fields: Vec<(&str, Value)>) -> Value {
    values::Embedded(object(class, fields)).into()
}

fn text(value: &str) -> Value {
    values::String::new(value.to_owned()).into()
}

fn texture(file: &str) -> Value {
    text(&format!("{PARTICLES}{file}"))
}

fn f32(value: f32) -> Value {
    values::F32::new(value).into()
}

fn byte(value: u8) -> Value {
    values::U8::new(value).into()
}

fn word(value: u16) -> Value {
    values::U16::new(value).into()
}

fn int(value: i32) -> Value {
    values::I32::new(value).into()
}

fn flag() -> Value {
    values::BitBool::new(true).into()
}

fn flag_off() -> Value {
    values::BitBool::new(false).into()
}

fn some(value: f32) -> Value {
    values::Optional::new(Kind::F32, Some(f32(value)))
        .expect("an f32 option takes an f32")
        .into()
}

fn none() -> Value {
    values::Optional::new(Kind::F32, None)
        .expect("an f32 option may be empty")
        .into()
}

fn vector2(x: f32, y: f32) -> Value {
    values::Vector2::new(Vec2::new(x, y)).into()
}

fn list(kind: Kind, items: Vec<Value>) -> Value {
    values::Container::new(kind, items)
        .expect("every item is of the list's kind")
        .into()
}

fn table((least, most): (f32, f32)) -> Value {
    pointer(
        "VfxProbabilityTableData",
        vec![
            ("keyTimes", list(Kind::F32, vec![f32(0.0), f32(1.0)])),
            ("keyValues", list(Kind::F32, vec![f32(least), f32(most)])),
        ],
    )
}

fn float(value: f32) -> Value {
    embed("ValueFloat", vec![("constantValue", f32(value))])
}

fn float_keys(times: &[f32], values: &[f32]) -> Value {
    let dynamics = pointer(
        "VfxAnimatedFloatVariableData",
        vec![
            (
                "times",
                list(Kind::F32, times.iter().copied().map(f32).collect()),
            ),
            (
                "values",
                list(Kind::F32, values.iter().copied().map(f32).collect()),
            ),
        ],
    );
    embed(
        "ValueFloat",
        vec![("constantValue", f32(values[0])), ("dynamics", dynamics)],
    )
}

fn float_random(value: f32, least: f32, most: f32) -> Value {
    let dynamics = pointer(
        "VfxAnimatedFloatVariableData",
        vec![
            ("times", list(Kind::F32, vec![f32(0.0)])),
            ("values", list(Kind::F32, vec![f32(value)])),
            (
                "probabilityTables",
                list(Kind::Struct, vec![table((least, most))]),
            ),
        ],
    );
    embed(
        "ValueFloat",
        vec![("constantValue", f32(value)), ("dynamics", dynamics)],
    )
}

fn vec3(value: [f32; 3]) -> Value {
    values::Vector3::new(Vec3::from_array(value)).into()
}

fn vector3(x: f32, y: f32, z: f32) -> Value {
    embed("ValueVector3", vec![("constantValue", vec3([x, y, z]))])
}

fn integrated_vector3(x: f32, y: f32, z: f32) -> Value {
    embed(
        "IntegratedValueVector3",
        vec![("constantValue", vec3([x, y, z]))],
    )
}

fn vector3_keys(times: &[f32], values: &[[f32; 3]]) -> Value {
    let dynamics = pointer(
        "VfxAnimatedVector3fVariableData",
        vec![
            (
                "times",
                list(Kind::F32, times.iter().copied().map(f32).collect()),
            ),
            (
                "values",
                list(Kind::Vector3, values.iter().copied().map(vec3).collect()),
            ),
        ],
    );
    embed(
        "ValueVector3",
        vec![("constantValue", vec3(values[0])), ("dynamics", dynamics)],
    )
}

fn vector3_random(value: [f32; 3], ranges: [(f32, f32); 3]) -> Value {
    let dynamics = pointer(
        "VfxAnimatedVector3fVariableData",
        vec![
            ("times", list(Kind::F32, vec![f32(0.0)])),
            ("values", list(Kind::Vector3, vec![vec3(value)])),
            (
                "probabilityTables",
                list(Kind::Struct, ranges.into_iter().map(table).collect()),
            ),
        ],
    );
    embed(
        "ValueVector3",
        vec![("constantValue", vec3(value)), ("dynamics", dynamics)],
    )
}

fn vec4(value: [f32; 4]) -> Value {
    values::Vector4::new(Vec4::from_array(value)).into()
}

fn color(r: f32, g: f32, b: f32, a: f32) -> Value {
    embed("ValueColor", vec![("constantValue", vec4([r, g, b, a]))])
}

fn colors(times: &[f32], values: &[[f32; 4]]) -> Value {
    let dynamics = pointer(
        "VfxAnimatedColorVariableData",
        vec![
            (
                "times",
                list(Kind::F32, times.iter().copied().map(f32).collect()),
            ),
            (
                "values",
                list(Kind::Vector4, values.iter().copied().map(vec4).collect()),
            ),
        ],
    );
    embed(
        "ValueColor",
        vec![("constantValue", vec4(values[0])), ("dynamics", dynamics)],
    )
}

/// White keyed over the particle's life, its alpha at `alphas`.
fn color_keys(times: &[f32], alphas: &[f32]) -> Value {
    let keyed: Vec<[f32; 4]> = alphas.iter().map(|&alpha| [1.0, 1.0, 1.0, alpha]).collect();
    colors(times, &keyed)
}

/// Whole until `hold` of the life, then faded to nothing at its end.
fn fade_out(hold: f32) -> Value {
    if hold <= 0.0 {
        return color_keys(&[0.0, 1.0], &[1.0, 0.0]);
    }
    color_keys(&[0.0, hold, 1.0], &[1.0, 1.0, 0.0])
}

/// Faded in by `peak` of the life, then out by its end.
fn fade_in_out(peak: f32) -> Value {
    color_keys(&[0.0, peak, 1.0], &[0.0, 1.0, 0.0])
}

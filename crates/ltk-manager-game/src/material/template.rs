//! A new map `StaticMaterialDef` from one of the stock static mesh shaders, as the map editor's
//! import creates one. "Materials" in docs/ux/MAP_EDITOR.md.

use glam::Vec4;
use indexmap::IndexMap;
use ltk_hash::{BinHash, Hash as _, WadHash};
use ltk_manager_base::hashing::named;
use ltk_meta::PropertyValueEnum;
use ltk_meta::property::{Kind, values};
use serde::{Deserialize, Serialize};

use ltk_manager_bin::bin_document::clipboard_text;

use super::{
    BLEND_ENABLE, DST_COLOR_BLEND_FACTOR, NAME, PARAM_VALUES, PASSES, SAMPLER_VALUES, SHADER,
    SHADER_MACROS, SWITCHES, TECHNIQUES, TEXTURE_NAME, TEXTURE_PATH, VALUE,
};

const STATIC_MATERIAL_DEF: &str = "StaticMaterialDef";
const MATERIAL_TYPE: BinHash = named("type");
const SAMPLER_DEF: BinHash = named("StaticMaterialShaderSamplerDef");
const PARAM_DEF: BinHash = named("StaticMaterialShaderParamDef");
const SWITCH_DEF: BinHash = named("StaticMaterialSwitchDef");
const TECHNIQUE_DEF: BinHash = named("StaticMaterialTechniqueDef");
const PASS_DEF: BinHash = named("StaticMaterialPassDef");
const DST_ALPHA_BLEND_FACTOR: BinHash = named("dstAlphaBlendFactor");

/// `D3D11_BLEND_INV_SRC_ALPHA`, which every shipped alpha-tested map material blends with.
const INV_SRC_ALPHA: u32 = 7;

/// The `TintColor` that both stock shaders default to.
const TINT_COLOR: Vec4 = Vec4::new(0.501_960_8, 0.501_960_8, 0.501_960_8, 0.0);

/// The stock static mesh shader that a created map material links.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub enum MaterialTemplate {
    /// `Shaders/StaticMesh/DefaultEnv_Flat`.
    Flat,
    /// `Shaders/StaticMesh/DefaultEnv_Flat_AlphaTest`.
    FlatAlphaTest,
}

impl MaterialTemplate {
    /// The `CustomShaderDef` that the template links.
    #[must_use]
    pub fn shader(self) -> &'static str {
        match self {
            Self::Flat => "Shaders/StaticMesh/DefaultEnv_Flat",
            Self::FlatAlphaTest => "Shaders/StaticMesh/DefaultEnv_Flat_AlphaTest",
        }
    }

    /// The shader's `defaultTexturePath` for `DiffuseTexture`.
    #[must_use]
    pub fn default_texture(self) -> &'static str {
        match self {
            Self::Flat => "assets/shared/materials/rock_texture.tex",
            Self::FlatAlphaTest => "assets/shared/materials/generic_hex_2.tex",
        }
    }
}

fn string(text: &str) -> PropertyValueEnum {
    values::String::new(text.to_owned()).into()
}

fn embedded(class: BinHash, properties: Vec<(BinHash, PropertyValueEnum)>) -> PropertyValueEnum {
    values::Embedded(values::Struct {
        class_hash: class,
        properties: properties.into_iter().collect::<IndexMap<_, _>>(),
    })
    .into()
}

/// A `list` of embedded structs.
fn list(items: Vec<PropertyValueEnum>) -> PropertyValueEnum {
    values::Container::new(Kind::Embedded, items)
        .expect("every item is an embedded struct")
        .into()
}

/// A `list2` of embedded structs.
fn list2(items: Vec<PropertyValueEnum>) -> PropertyValueEnum {
    values::UnorderedContainer(
        values::Container::new(Kind::Embedded, items).expect("every item is an embedded struct"),
    )
    .into()
}

/// Returns the `StaticMaterialDef` named `name` that links `template` and draws `texture`, as
/// the clipboard text that a pasted object reads.
///
/// The fields are the ones that shipped map materials of the same shader write: the name, `type`
/// 0, a value for every shader parameter, a `texturePath` for the shader's one sampler, no baked
/// lighting, and for the alpha-tested shader its switch and blend state.
#[must_use]
pub fn material_text(name: &str, template: MaterialTemplate, texture: &str) -> String {
    let mut params = vec![embedded(
        PARAM_DEF,
        vec![
            (NAME, string("TintColor")),
            (VALUE, values::Vector4::new(TINT_COLOR).into()),
        ],
    )];
    let mut macros = vec![("NO_BAKED_LIGHTING", "1"), ("DISABLE_DEPTH_FOG", "1")];
    let mut pass = vec![(
        SHADER,
        values::ObjectLink::new(BinHash::hash_str(template.shader())).into(),
    )];
    let mut properties = vec![
        (NAME, string(name)),
        (MATERIAL_TYPE, values::U8::new(0).into()),
        (
            SAMPLER_VALUES,
            list2(vec![embedded(
                SAMPLER_DEF,
                vec![
                    (TEXTURE_NAME, string("DiffuseTexture")),
                    (
                        TEXTURE_PATH,
                        values::WadChunkLink::new(WadHash::hash_str(texture)).into(),
                    ),
                ],
            )]),
        ),
    ];

    if template == MaterialTemplate::FlatAlphaTest {
        params.push(embedded(
            PARAM_DEF,
            vec![
                (NAME, string("AlphaTestValue")),
                (
                    VALUE,
                    values::Vector4::new(Vec4::new(0.3, 0.0, 0.0, 0.0)).into(),
                ),
            ],
        ));
        macros.push(("PREMULTIPLIED_ALPHA", "1"));
        pass.extend([
            (BLEND_ENABLE, values::Bool::new(true).into()),
            (
                DST_COLOR_BLEND_FACTOR,
                values::U32::new(INV_SRC_ALPHA).into(),
            ),
            (
                DST_ALPHA_BLEND_FACTOR,
                values::U32::new(INV_SRC_ALPHA).into(),
            ),
        ]);
    }

    properties.push((PARAM_VALUES, list2(params)));
    if template == MaterialTemplate::FlatAlphaTest {
        properties.push((
            SWITCHES,
            list2(vec![embedded(
                SWITCH_DEF,
                vec![(NAME, string("MULTIPLY_ALPHA"))],
            )]),
        ));
    }
    let macros = macros
        .into_iter()
        .map(|(key, value)| (string(key), string(value)))
        .collect();
    properties.push((
        SHADER_MACROS,
        values::Map::new(Kind::String, Kind::String, macros)
            .expect("string keys and values")
            .into(),
    ));
    properties.push((
        TECHNIQUES,
        list(vec![embedded(
            TECHNIQUE_DEF,
            vec![
                (NAME, string("normal")),
                (PASSES, list(vec![embedded(PASS_DEF, pass)])),
            ],
        )]),
    ));

    let value = PropertyValueEnum::from(values::Struct {
        class_hash: named(STATIC_MATERIAL_DEF),
        properties: properties.into_iter().collect(),
    });
    clipboard_text(&value, Some(STATIC_MATERIAL_DEF))
}

#[cfg(test)]
mod tests {
    use super::*;
    use ltk_manager_bin::bin_document::clipboard_value;

    #[test]
    fn material_text_reads_back_as_static_material_def() {
        let text = material_text(
            "Maps/Test/Materials/Rock",
            MaterialTemplate::FlatAlphaTest,
            "assets/maps/test/rock.tex",
        );

        let Some(PropertyValueEnum::Struct(material)) = clipboard_value(&text) else {
            panic!("the text holds a struct");
        };
        assert_eq!(material.class_hash, named(STATIC_MATERIAL_DEF));
        assert_eq!(
            material.properties.get(&NAME),
            Some(&string("Maps/Test/Materials/Rock"))
        );
        assert!(material.properties.contains_key(&SWITCHES));
    }
}

//! What every template must hold before it ships: its class, a value the schema declares, a
//! texture on every emitter, shipped assets only, and nothing the preview culls or cannot draw.
//! "Assets and checks" in docs/plans/vfx-templates.md.

use std::collections::HashSet;

use ltk_meta::property::values;

use super::*;
use crate::meta_schema::TypeSpec;
use crate::meta_schema::{MetaSchema, SchemaAt};

/// The most emitters one property edit lands, two edits each.
const MOST_EMITTERS: usize = 32;

/// Every asset a template names, each found in `Global.wad.client` of patch 2026-09-23.
const SHIPPED: &[&str] = &[
    "assets/shared/particles/base_brightspark.tex",
    "assets/shared/particles/base_circle_normal.tex",
    "assets/shared/particles/base_dot.tex",
    "assets/shared/particles/base_smokeerode.tex",
    "assets/shared/particles/base_trail_01.tex",
    "assets/shared/particles/blast_ring_16.tex",
    "assets/shared/particles/common_bigglow.tex",
    "assets/shared/particles/explosion_groundburn.tex",
    "assets/shared/particles/global_ss_ignite_fire.tex",
    "assets/shared/particles/smoke_clouds_2x2_hc.tex",
    "assets/shared/particles/vs_outerring.tex",
    "assets/shared/particles/white.tex",
];

/// The fields whose text is an asset path.
const ASSET_FIELDS: &[&str] = &["texture", "erosionMapName", "normalMapTexture"];

fn h(name: &str) -> BinHash {
    BinHash::hash_str(name)
}

fn value_of(template: &VfxTemplate) -> values::Struct {
    let entry = CATALOG
        .iter()
        .find(|entry| entry.id == template.id)
        .expect("every template is an entry of the catalog");
    match clipboard_value(entry.text) {
        Some(PropertyValueEnum::Struct(value)) => value,
        other => panic!("{} is no struct: {other:?}", template.id),
    }
}

/// Every emitter a template holds: itself, or a system's list.
fn emitters_of(template: &VfxTemplate) -> Vec<values::Struct> {
    let value = value_of(template);
    if template.kind == VfxTemplateKind::Emitter {
        return vec![value];
    }

    let Some(PropertyValueEnum::Container(list)) =
        value.properties.get(&h("complexEmitterDefinitionData"))
    else {
        panic!("{} holds no emitter list", template.id);
    };
    list.items()
        .iter()
        .map(|item| match item {
            PropertyValueEnum::Struct(emitter) => emitter.clone(),
            other => panic!("{} lists a non-struct: {other:?}", template.id),
        })
        .collect()
}

/// The class of a struct or an embed, and `None` for anything else.
fn class_of(value: &PropertyValueEnum) -> Option<BinHash> {
    match value {
        PropertyValueEnum::Struct(inner) if inner.class_hash.0 != 0 => Some(inner.class_hash),
        PropertyValueEnum::Embedded(values::Embedded(inner)) => Some(inner.class_hash),
        _ => None,
    }
}

/// Every departure of `object` from what `schema` declares, under `path`.
fn mismatches(schema: SchemaAt<'_>, object: &values::Struct, path: &str, out: &mut Vec<String>) {
    let class = object.class_hash;
    if schema.class_name(class).is_none() {
        out.push(format!("{path}: class {class:?} is unknown"));
        return;
    }

    for (field, value) in &object.properties {
        let Some(declared) = schema.declared_field(class, *field) else {
            out.push(format!("{path}: {field:?} is no field of its class"));
            continue;
        };
        let name = declared.name.unwrap_or("?");
        let at = format!("{path}.{name}");

        let spec = TypeSpec::from(declared.shape);
        if !spec.matches(value).expect("a template value is readable") {
            out.push(format!("{at}: wants {}", spec.label()));
            continue;
        }

        let items: Vec<&PropertyValueEnum> = match value {
            PropertyValueEnum::Container(list) => list.items().iter().collect(),
            other => vec![other],
        };
        for item in items {
            let Some(held) = class_of(item) else { continue };
            if let Some(wanted) = declared.class
                && held != wanted
                && !schema.derived_classes(wanted).contains(&held)
            {
                out.push(format!(
                    "{at}: class {held:?} does not derive from {wanted:?}"
                ));
            }

            match item {
                PropertyValueEnum::Struct(inner) => mismatches(schema, inner, &at, out),
                PropertyValueEnum::Embedded(values::Embedded(inner)) => {
                    mismatches(schema, inner, &at, out);
                }
                _ => {}
            }
        }
    }
}

/// Every string an asset field holds under `object`, at any depth.
fn assets(object: &values::Struct, out: &mut Vec<String>) {
    for (field, value) in &object.properties {
        match value {
            PropertyValueEnum::String(text)
                if ASSET_FIELDS.iter().any(|name| h(name) == *field) =>
            {
                out.push(text.value.clone());
            }
            PropertyValueEnum::Struct(inner) => assets(inner, out),
            PropertyValueEnum::Embedded(values::Embedded(inner)) => assets(inner, out),
            PropertyValueEnum::Container(list) => {
                for item in list.items() {
                    match item {
                        PropertyValueEnum::Struct(inner) => assets(inner, out),
                        PropertyValueEnum::Embedded(values::Embedded(inner)) => assets(inner, out),
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }
}

#[test]
fn every_template_is_a_value_of_its_class() {
    for template in vfx_templates() {
        let class = match template.kind {
            VfxTemplateKind::Emitter => "VfxEmitterDefinitionData",
            VfxTemplateKind::System => "VfxSystemDefinitionData",
        };
        assert_eq!(value_of(&template).class_hash, h(class), "{}", template.id);
    }
}

#[test]
fn every_template_holds_only_what_the_schema_declares() {
    let schema = MetaSchema::shipped();
    let at = schema.at(None);

    for template in vfx_templates() {
        let mut out = Vec::new();
        mismatches(at, &value_of(&template), &template.id, &mut out);
        assert!(out.is_empty(), "{out:#?}");
    }
}

#[test]
fn every_emitter_names_a_texture() {
    for template in vfx_templates() {
        for emitter in emitters_of(&template) {
            let texture = emitter.properties.get(&h("texture"));
            assert!(
                matches!(texture, Some(PropertyValueEnum::String(text)) if !text.value.is_empty()),
                "{} has an emitter with no texture",
                template.id
            );
        }
    }
}

#[test]
fn every_asset_is_one_the_game_ships() {
    for template in vfx_templates() {
        let mut found = Vec::new();
        assets(&value_of(&template), &mut found);
        for path in found {
            assert!(
                SHIPPED.contains(&path.as_str()),
                "{} names {path}",
                template.id
            );
        }
    }
}

#[test]
fn no_emitter_writes_what_the_preview_culls_or_cannot_draw() {
    let culling = [h("importance"), h("colorblindVisibility")];
    let projection = h("VfxPrimitivePlanarProjection");

    for template in vfx_templates() {
        for emitter in emitters_of(&template) {
            assert!(
                culling
                    .iter()
                    .all(|field| !emitter.properties.contains_key(field)),
                "{} culls an emitter",
                template.id
            );
            let primitive = emitter.properties.get(&h("primitive")).and_then(class_of);
            assert_ne!(primitive, Some(projection), "{}", template.id);
        }
    }
}

#[test]
fn a_system_template_lists_its_emitters_within_one_edit() {
    for template in vfx_templates() {
        if template.kind != VfxTemplateKind::System {
            assert_eq!(template.emitters.len(), 1, "{}", template.id);
            assert_eq!(template.emitters[0].name, template.name, "{}", template.id);
            assert!(template.rig.is_none(), "{}", template.id);
            continue;
        }

        let held = emitters_of(&template);
        assert!(
            !held.is_empty() && held.len() <= MOST_EMITTERS,
            "{}",
            template.id
        );
        assert_eq!(template.emitters.len(), held.len(), "{}", template.id);
        assert!(template.rig.is_some(), "{}", template.id);
        assert!(
            vfx_system_template(&template.id).is_some(),
            "{}",
            template.id
        );
    }
}

#[test]
fn every_id_and_every_name_in_a_system_is_its_own() {
    let ids: HashSet<String> = vfx_templates().into_iter().map(|each| each.id).collect();
    assert_eq!(ids.len(), vfx_templates().len());

    let name = h("emitterName");
    for template in vfx_templates() {
        let names: Vec<String> = emitters_of(&template)
            .iter()
            .filter_map(|emitter| match emitter.properties.get(&name) {
                Some(PropertyValueEnum::String(text)) => Some(text.value.clone()),
                _ => None,
            })
            .collect();
        let unique: HashSet<&String> = names.iter().collect();
        assert_eq!(unique.len(), names.len(), "{}", template.id);
        assert_eq!(
            names.len(),
            template.emitters.len(),
            "{} has an unnamed emitter",
            template.id
        );
        assert!(
            template.emitters.iter().all(|each| !each.name.is_empty()),
            "{}",
            template.id
        );
    }
}

#[test]
fn the_schema_check_catches_a_value_of_the_wrong_kind() {
    let schema = MetaSchema::shipped();
    let colour = values::Struct {
        class_hash: h("ValueColor"),
        properties: [(h("constantValue"), values::Vector3::default().into())]
            .into_iter()
            .collect(),
    };
    let emitter = values::Struct {
        class_hash: h("VfxEmitterDefinitionData"),
        properties: [(h("birthColor"), values::Embedded(colour).into())]
            .into_iter()
            .collect(),
    };

    let mut out = Vec::new();
    mismatches(schema.at(None), &emitter, "emitter", &mut out);

    assert_eq!(out.len(), 1, "{out:#?}");
    assert!(out[0].contains("constantValue"), "{out:#?}");
}

#[test]
#[ignore = "a template ships once it is checked in game, per docs/plans/vfx-templates.md"]
fn every_template_names_the_patch_it_was_checked_on() {
    for template in vfx_templates() {
        assert!(
            template.checked.is_some(),
            "{} is not checked in game",
            template.id
        );
    }
}

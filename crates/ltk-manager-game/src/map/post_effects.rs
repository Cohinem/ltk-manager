//! A map's screen effects: the `PostEffectOptions` of its post effect component.

use ltk_hash::BinHash;
use serde::Serialize;

use super::MapPath;
use super::component::{bool_of, f32_of, map_component, vec4_of};
use ltk_manager_core::bin_document::{BinDocument, Fields, struct_of};

/// The unnamed `MapGraphicsFeature` whose `options` are the map's `PostEffectOptions`.
const POST_EFFECTS: BinHash = BinHash(0x50db_156b);
/// `options`, an embedded `PostEffectOptions`.
const OPTIONS: BinHash = BinHash(0xef28_6ca5);
/// `DepthFog` and the four fields named after it.
const DEPTH_FOG: FogFields = FogFields {
    enabled: BinHash(0xd23c_9e02),
    color: BinHash(0x4d87_c515),
    start: BinHash(0xa6ce_8c9a),
    end: BinHash(0x456d_362f),
    max_intensity: BinHash(0x749b_3695),
};
/// `HeightFog` and the four fields named after it.
const HEIGHT_FOG: FogFields = FogFields {
    enabled: BinHash(0x3200_6fba),
    color: BinHash(0xb0d4_508d),
    start: BinHash(0x8e73_1442),
    end: BinHash(0x2188_a687),
    max_intensity: BinHash(0x7a8d_755d),
};
/// `PostEffectOptions.Dof`.
const DOF: BinHash = BinHash(0xe568_bb76);
/// `FocalDistance`, a name the meta does not state and the hash matches.
const FOCAL_DISTANCE: BinHash = BinHash(0x88ab_79b5);
/// `InFocusWidth`, a name the meta does not state and the hash matches.
const IN_FOCUS_WIDTH: BinHash = BinHash(0x8e1f_ed5e);
/// `PostEffectOptions.Coc`.
const COC: BinHash = BinHash(0xeb8d_c96c);

/// The fields one fog of `PostEffectOptions` is stated in.
struct FogFields {
    enabled: BinHash,
    color: BinHash,
    start: BinHash,
    end: BinHash,
    max_intensity: BinHash,
}

/// A map's post effects, as its `PostEffectOptions` states them.
///
/// A field the map leaves out reads as the class default, which [`MapPostEffects::default`]
/// returns and which switches every effect off.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[cfg_attr(feature = "ts", ts(export))]
pub struct MapPostEffects {
    /// `DepthFog` and its fields, which fog by distance from the camera.
    pub depth_fog: MapFog,
    /// `HeightFog` and its fields, which fog by height in the world.
    pub height_fog: MapFog,
    /// `Dof` and its fields.
    pub depth_of_field: MapDepthOfField,
}

/// One fog of [`MapPostEffects`], ramping from nothing at `start` to its most at `end`.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[cfg_attr(feature = "ts", ts(export))]
pub struct MapFog {
    /// The fog is drawn.
    pub enabled: bool,
    /// RGBA with each channel 0 to 1, as the bin writes it.
    pub color: [f32; 4],
    /// Where the fog begins, a distance or a height in world units.
    pub start: f32,
    /// Where the fog reaches `max_intensity`.
    pub end: f32,
    /// The most the fog covers, 0 to 1.
    pub max_intensity: f32,
}

/// The depth of field of [`MapPostEffects`].
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[cfg_attr(feature = "ts", ts(export))]
pub struct MapDepthOfField {
    /// The blur is drawn.
    pub enabled: bool,
    /// The distance from the camera that is sharpest.
    pub focal_distance: f32,
    /// How deep the sharp band around `focal_distance` is.
    pub in_focus_width: f32,
    /// `Coc`, the circle of confusion the blur widens to.
    pub coc: f32,
}

impl Default for MapPostEffects {
    /// The class defaults `PostEffectOptions` declares.
    fn default() -> Self {
        Self {
            depth_fog: MapFog {
                enabled: false,
                color: [0.0, 0.0, 0.0, 1.0],
                start: 5000.0,
                end: 8000.0,
                max_intensity: 1.0,
            },
            height_fog: MapFog {
                enabled: false,
                color: [0.0, 0.0, 0.0, 1.0],
                start: 300.0,
                end: -100.0,
                max_intensity: 1.0,
            },
            depth_of_field: MapDepthOfField {
                enabled: false,
                focal_distance: 2000.0,
                in_focus_width: 800.0,
                coc: 10.0,
            },
        }
    }
}

/// The post effects of `map`'s container in its own `.materials.bin`, and none where it
/// states none.
///
/// The container is the object at `map`'s entry path, else the file's first `MapContainer`.
/// A component without `options` reads as the class defaults.
#[must_use]
pub fn map_post_effects(materials: &BinDocument, map: &MapPath) -> Option<MapPostEffects> {
    let component = map_component(materials, map, POST_EFFECTS)?;
    Some(match struct_of(component.get(&OPTIONS)) {
        Some((_, options)) => post_effects_of(options),
        None => MapPostEffects::default(),
    })
}

fn post_effects_of(fields: &Fields) -> MapPostEffects {
    let stated = MapPostEffects::default();
    let focus = stated.depth_of_field;
    MapPostEffects {
        depth_fog: fog_of(fields, &DEPTH_FOG, stated.depth_fog),
        height_fog: fog_of(fields, &HEIGHT_FOG, stated.height_fog),
        depth_of_field: MapDepthOfField {
            enabled: bool_of(fields, DOF).unwrap_or(focus.enabled),
            focal_distance: f32_of(fields, FOCAL_DISTANCE).unwrap_or(focus.focal_distance),
            in_focus_width: f32_of(fields, IN_FOCUS_WIDTH).unwrap_or(focus.in_focus_width),
            coc: f32_of(fields, COC).unwrap_or(focus.coc),
        },
    }
}

fn fog_of(fields: &Fields, named: &FogFields, stated: MapFog) -> MapFog {
    MapFog {
        enabled: bool_of(fields, named.enabled).unwrap_or(stated.enabled),
        color: vec4_of(fields, named.color).unwrap_or(stated.color),
        start: f32_of(fields, named.start).unwrap_or(stated.start),
        end: f32_of(fields, named.end).unwrap_or(stated.end),
        max_intensity: f32_of(fields, named.max_intensity).unwrap_or(stated.max_intensity),
    }
}

#[cfg(test)]
mod tests;

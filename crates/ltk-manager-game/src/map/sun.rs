//! A map's daylight: the `MapSunProperties` component of its `MapContainer`.

use ltk_hash::BinHash;
use serde::Serialize;

use super::MapPath;
use super::component::{f32_of, map_component, vec3_of, vec4_of};
use ltk_manager_core::bin_document::{BinDocument, Fields};

/// `MapSunProperties`, the `MapComponent` that lights the map.
const SUN_PROPERTIES: BinHash = BinHash(0x169a_2f9c);
/// `MapSunProperties.sunDirection`.
const SUN_DIRECTION: BinHash = BinHash(0xe190_7cf6);
/// `MapSunProperties.sunColor`.
const SUN_COLOR: BinHash = BinHash(0x664a_1f44);
/// `MapSunProperties.SunIntensityScale`.
const SUN_INTENSITY: BinHash = BinHash(0x4620_fe14);
/// `MapSunProperties.skyLightColor`.
const SKY_COLOR: BinHash = BinHash(0x0a65_794d);
/// `MapSunProperties.groundColor`.
const GROUND_COLOR: BinHash = BinHash(0x583b_efe1);
/// `MapSunProperties.skyLightScale`.
const SKY_SCALE: BinHash = BinHash(0xb39b_0430);

/// A map's sun and sky, as its `MapSunProperties` states them.
///
/// Colours are RGBA with each channel 0 to 1, as the bin writes them. A field the map
/// leaves out reads as the class default, which [`MapSun::default`] returns.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[cfg_attr(feature = "ts", ts(export))]
pub struct MapSun {
    /// `sunDirection`, which points at the sun in the engine's space.
    pub direction: [f32; 3],
    /// `sunColor`.
    pub color: [f32; 4],
    /// `SunIntensityScale`.
    pub intensity: f32,
    /// `skyLightColor`.
    pub sky_color: [f32; 4],
    /// `groundColor`.
    pub ground_color: [f32; 4],
    /// `skyLightScale`.
    pub sky_scale: f32,
}

impl Default for MapSun {
    /// The class defaults `MapSunProperties` declares.
    fn default() -> Self {
        Self {
            direction: [0.0, 0.707, 0.707],
            color: [1.0, 1.0, 1.0, 1.0],
            intensity: 1.0,
            sky_color: [0.705, 0.88, 1.0, 1.0],
            ground_color: [0.1, 0.1, 0.1, 1.0],
            sky_scale: 0.2,
        }
    }
}

/// The sun of `map`'s container in its own `.materials.bin`, and none where it states none.
///
/// The container is the object at `map`'s entry path, else the file's first `MapContainer`.
#[must_use]
pub fn map_sun(materials: &BinDocument, map: &MapPath) -> Option<MapSun> {
    map_component(materials, map, SUN_PROPERTIES).map(sun_of)
}

fn sun_of(fields: &Fields) -> MapSun {
    let stated = MapSun::default();
    MapSun {
        direction: vec3_of(fields, SUN_DIRECTION).unwrap_or(stated.direction),
        color: vec4_of(fields, SUN_COLOR).unwrap_or(stated.color),
        intensity: f32_of(fields, SUN_INTENSITY).unwrap_or(stated.intensity),
        sky_color: vec4_of(fields, SKY_COLOR).unwrap_or(stated.sky_color),
        ground_color: vec4_of(fields, GROUND_COLOR).unwrap_or(stated.ground_color),
        sky_scale: f32_of(fields, SKY_SCALE).unwrap_or(stated.sky_scale),
    }
}

#[cfg(test)]
mod tests;

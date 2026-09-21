//! A map's ambient occlusion: the `MapSSAOSettings` of its `MapSSAO` component.

use ltk_hash::BinHash;
use serde::Serialize;

use super::MapPath;
use super::component::{bool_of, f32_of, map_component, u32_of};
use ltk_manager_core::bin_document::{BinDocument, Fields, struct_of};

/// `MapSSAO`.
const MAP_SSAO: BinHash = BinHash(0x1717_869f);
/// `MapSSAO.MapSSAORenderer`, an embedded `MapSSAORenderer`.
const RENDERER: BinHash = BinHash(0xce8f_4190);
/// `MapSSAORenderer.settings`, an embedded `MapSSAOSettings`.
const SETTINGS: BinHash = BinHash(0x6806_7b08);
/// `MapSSAOSettings.SampleQuality`.
const SAMPLE_QUALITY: BinHash = BinHash(0x1fd6_70cc);
/// `MapSSAOSettings.SampleRadius`.
const SAMPLE_RADIUS: BinHash = BinHash(0x9a8c_9615);
/// `MapSSAOSettings.Bias`.
const BIAS: BinHash = BinHash(0xba46_7ec4);
/// `MapSSAOSettings.power`.
const POWER: BinHash = BinHash(0xf54f_2346);
/// `MapSSAOSettings.intensity`.
const INTENSITY: BinHash = BinHash(0x8563_e50a);
/// `MapSSAOSettings.BufferScale`.
const BUFFER_SCALE: BinHash = BinHash(0xe94a_e473);
/// `EdgeAwareBlur`, a name the meta does not state and the hash matches.
const EDGE_AWARE_BLUR: BinHash = BinHash(0x6509_d993);

/// A map's screen-space ambient occlusion, as its `MapSSAOSettings` states it.
///
/// A field the map leaves out reads as the class default, which [`MapSsao::default`]
/// returns.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[cfg_attr(feature = "ts", ts(export))]
pub struct MapSsao {
    /// `SampleQuality`, 0 for four samples a pixel and 1 for eight.
    pub sample_quality: u32,
    /// `SampleRadius`, how far from a pixel its samples reach, in world units.
    pub sample_radius: f32,
    /// `Bias`, how far in front of a sample the scene must be to occlude it, in world units.
    pub bias: f32,
    /// `power`, the exponent the unoccluded share of a pixel is raised to.
    pub power: f32,
    /// `intensity`, how much of the occlusion reaches the frame, 0 to 1.
    pub intensity: f32,
    /// `BufferScale`, the occlusion's resolution as a share of the frame's.
    pub buffer_scale: f32,
    /// `EdgeAwareBlur`, the blur keeps a nearer surface's occlusion off the one behind it.
    pub edge_aware_blur: bool,
}

impl Default for MapSsao {
    /// The class defaults `MapSSAOSettings` declares.
    fn default() -> Self {
        Self {
            sample_quality: 0,
            sample_radius: 25.0,
            bias: 3.0,
            power: 1.0,
            intensity: 1.0,
            buffer_scale: 0.5,
            edge_aware_blur: true,
        }
    }
}

/// The ambient occlusion of `map`'s container in its own `.materials.bin`, and none where
/// it states none.
///
/// The container is the object at `map`'s entry path, else the file's first `MapContainer`.
/// A component without settings reads as the class defaults.
#[must_use]
pub fn map_ssao(materials: &BinDocument, map: &MapPath) -> Option<MapSsao> {
    let component = map_component(materials, map, MAP_SSAO)?;
    let settings = struct_of(component.get(&RENDERER))
        .and_then(|(_, renderer)| struct_of(renderer.get(&SETTINGS)));
    Some(match settings {
        Some((_, settings)) => ssao_of(settings),
        None => MapSsao::default(),
    })
}

fn ssao_of(fields: &Fields) -> MapSsao {
    let stated = MapSsao::default();
    MapSsao {
        sample_quality: u32_of(fields, SAMPLE_QUALITY).unwrap_or(stated.sample_quality),
        sample_radius: f32_of(fields, SAMPLE_RADIUS).unwrap_or(stated.sample_radius),
        bias: f32_of(fields, BIAS).unwrap_or(stated.bias),
        power: f32_of(fields, POWER).unwrap_or(stated.power),
        intensity: f32_of(fields, INTENSITY).unwrap_or(stated.intensity),
        buffer_scale: f32_of(fields, BUFFER_SCALE).unwrap_or(stated.buffer_scale),
        edge_aware_blur: bool_of(fields, EDGE_AWARE_BLUR).unwrap_or(stated.edge_aware_blur),
    }
}

#[cfg(test)]
mod tests;

//! The starter emitters and systems an author begins a new effect from. ADR-0058.
//!
//! Each template is clipboard text, so an emitter template lands through the same paste as a
//! copied emitter. `docs/plans/vfx-templates.md` holds the decisions.

use ltk_hash::{BinHash, Hash as _};
use ltk_meta::PropertyValueEnum;
use ltk_meta::property::values;
use serde::Serialize;

use crate::bin_document::{clipboard_text, clipboard_value};

/// The class every emitter of a system's lists holds.
const EMITTER_CLASS: &str = "VfxEmitterDefinitionData";

/// Whether a template is one emitter or a whole system.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub enum VfxTemplateKind {
    Emitter,
    System,
}

/// What carries a system a template made, per ADR-0057.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub enum TemplateCarrier {
    Ground,
    Flight,
    Orbit,
}

/// When a run of a system a template made starts over.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub enum TemplatePlayback {
    Once,
    Replay,
    Continuous,
}

/// The rig a system template was tuned on.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct TemplateRig {
    pub carrier: TemplateCarrier,
    pub playback: TemplatePlayback,
    /// A flight's speed in engine units a second, and `None` for the carrier's own.
    pub speed: Option<f32>,
}

/// One emitter a template lands, with the name it is written under.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct TemplateEmitter {
    /// The English `emitterName` it holds, which a landing numbers apart from the system's.
    pub name: String,
    /// The emitter as clipboard text.
    pub text: String,
}

/// One template of the catalog.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct VfxTemplate {
    /// The catalog's key, which the frontend's messages are named by.
    pub id: String,
    pub kind: VfxTemplateKind,
    /// The English name an emitter or a system made from it is written with.
    pub name: String,
    /// The rig a system template was tuned on, and `None` for an emitter template.
    pub rig: Option<TemplateRig>,
    /// The game patch the template was last checked on in game, and `None` for one not yet.
    pub checked: Option<String>,
    /// The emitters the template lands, in list order: itself for an emitter template.
    pub emitters: Vec<TemplateEmitter>,
}

/// One entry as the catalog holds it.
struct Entry {
    id: &'static str,
    kind: VfxTemplateKind,
    name: &'static str,
    rig: Option<TemplateRig>,
    checked: Option<&'static str>,
    text: &'static str,
}

const fn emitter(id: &'static str, name: &'static str, text: &'static str) -> Entry {
    Entry {
        id,
        kind: VfxTemplateKind::Emitter,
        name,
        rig: None,
        checked: None,
        text,
    }
}

const fn system(
    id: &'static str,
    name: &'static str,
    rig: TemplateRig,
    text: &'static str,
) -> Entry {
    Entry {
        id,
        kind: VfxTemplateKind::System,
        name,
        rig: Some(rig),
        checked: None,
        text,
    }
}

const fn rig(carrier: TemplateCarrier, playback: TemplatePlayback) -> TemplateRig {
    TemplateRig {
        carrier,
        playback,
        speed: None,
    }
}

/// Every template, in the order a picker lists them.
const CATALOG: &[Entry] = &[
    emitter("glow", "Glow", include_str!("templates/emitters/glow.json")),
    emitter(
        "sparks",
        "Sparks",
        include_str!("templates/emitters/sparks.json"),
    ),
    emitter(
        "smoke_puff",
        "Smoke",
        include_str!("templates/emitters/smoke_puff.json"),
    ),
    emitter(
        "shockwave_ring",
        "Shockwave",
        include_str!("templates/emitters/shockwave_ring.json"),
    ),
    emitter(
        "trail",
        "Trail",
        include_str!("templates/emitters/trail.json"),
    ),
    emitter(
        "distortion",
        "Distortion",
        include_str!("templates/emitters/distortion.json"),
    ),
    system(
        "explosion",
        "Explosion",
        rig(TemplateCarrier::Ground, TemplatePlayback::Replay),
        include_str!("templates/systems/explosion.json"),
    ),
    system(
        "missile",
        "Missile",
        TemplateRig {
            carrier: TemplateCarrier::Flight,
            playback: TemplatePlayback::Replay,
            speed: Some(1200.0),
        },
        include_str!("templates/systems/missile.json"),
    ),
    system(
        "aura",
        "Aura",
        rig(TemplateCarrier::Ground, TemplatePlayback::Continuous),
        include_str!("templates/systems/aura.json"),
    ),
];

/// Every template of the catalog.
///
/// # Panics
///
/// Where a catalog file is no sound clipboard text, which the module's tests rule out.
pub fn vfx_templates() -> Vec<VfxTemplate> {
    CATALOG
        .iter()
        .map(|entry| VfxTemplate {
            id: entry.id.to_owned(),
            kind: entry.kind,
            name: entry.name.to_owned(),
            rig: entry.rig,
            checked: entry.checked.map(str::to_owned),
            emitters: emitters_of(entry),
        })
        .collect()
}

/// The system template `id`'s value, and `None` for an id no system template has.
pub fn vfx_system_template(id: &str) -> Option<values::Struct> {
    let entry = CATALOG
        .iter()
        .find(|entry| entry.id == id && entry.kind == VfxTemplateKind::System)?;

    match clipboard_value(entry.text)? {
        PropertyValueEnum::Struct(system) => Some(system),
        _ => None,
    }
}

/// The emitters `entry` lands: its own value, or each item of a system's complex list.
fn emitters_of(entry: &Entry) -> Vec<TemplateEmitter> {
    let Some(value) = clipboard_value(entry.text) else {
        panic!("{} is no clipboard text", entry.id);
    };
    if entry.kind == VfxTemplateKind::Emitter {
        return vec![landed(value)];
    }

    let PropertyValueEnum::Struct(system) = value else {
        panic!("{} is no struct", entry.id);
    };
    let list = BinHash::hash_str("complexEmitterDefinitionData");
    match system.properties.get(&list) {
        Some(PropertyValueEnum::Container(emitters)) => {
            emitters.items().iter().cloned().map(landed).collect()
        }
        _ => Vec::new(),
    }
}

/// An emitter value as it lands: its name and its clipboard text.
fn landed(emitter: PropertyValueEnum) -> TemplateEmitter {
    let field = BinHash::hash_str("emitterName");
    let name = match &emitter {
        PropertyValueEnum::Struct(inner) => match inner.properties.get(&field) {
            Some(PropertyValueEnum::String(text)) => text.value.clone(),
            _ => String::new(),
        },
        _ => String::new(),
    };

    TemplateEmitter {
        name,
        text: clipboard_text(&emitter, Some(EMITTER_CLASS)),
    }
}

#[cfg(test)]
mod tests;

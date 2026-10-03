//! The VFX template catalog, which a new object of a declared document can start from.
//!
//! The resolved particle system a viewport draws is `ltk_manager_game::vfx`.

mod templates;

pub use templates::{
    TemplateCarrier, TemplateEmitter, TemplatePlayback, TemplateRig, VfxTemplate, VfxTemplateKind,
    vfx_system_template, vfx_templates,
};

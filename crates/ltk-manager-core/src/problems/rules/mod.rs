//! The checks the manager runs, one module for each.
//!
//! A new check is a rule and a row, and never a new panel. A rule is added
//! here, and every surface that draws problems draws it without changing.

pub mod bin_property_type;

use super::Rule;

/// Every rule a run calls, in the order it calls them.
#[must_use]
pub fn all() -> Vec<Box<dyn Rule>> {
    vec![Box::new(bin_property_type::BinPropertyType::new())]
}

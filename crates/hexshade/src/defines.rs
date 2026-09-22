//! The define list a permutation is picked by.

use std::collections::BTreeMap;
use std::fmt;

/// A define list, one value per name and ordered by name.
///
/// A bare define has an empty value. Collecting keeps the first value a name is given.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Default)]
pub struct Defines(BTreeMap<String, String>);

impl Defines {
    /// Set `name` to `value` unless the list already sets it.
    pub fn insert_missing(&mut self, name: &str, value: &str) {
        if !self.0.contains_key(name) {
            self.0.insert(name.to_owned(), value.to_owned());
        }
    }

    /// Each `(name, value)`, ordered by name.
    pub fn iter(&self) -> impl Iterator<Item = (&str, &str)> {
        self.0
            .iter()
            .map(|(name, value)| (name.as_str(), value.as_str()))
    }

    /// Each entry as `NAME=VALUE`, ordered by name.
    pub fn to_entries(&self) -> Vec<String> {
        self.iter()
            .map(|(name, value)| format!("{name}={value}"))
            .collect()
    }

    #[must_use]
    pub fn len(&self) -> usize {
        self.0.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

impl<N: Into<String>, V: Into<String>> FromIterator<(N, V)> for Defines {
    fn from_iter<I: IntoIterator<Item = (N, V)>>(iter: I) -> Self {
        let mut defines = BTreeMap::new();
        for (name, value) in iter {
            defines.entry(name.into()).or_insert_with(|| value.into());
        }
        Self(defines)
    }
}

/// `NAME=VALUE` entries joined by a space.
impl fmt::Display for Defines {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for (at, (name, value)) in self.iter().enumerate() {
            if at > 0 {
                f.write_str(" ")?;
            }
            write!(f, "{name}={value}")?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests;

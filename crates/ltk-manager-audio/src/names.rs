//! The event name table: event IDs back to the names that hash to them.

use std::collections::HashMap;

use ltk_wwise::ObjectId;

/// Event names by event ID.
///
/// An event ID is the FNV-1 hash of the lowercased name, so the table is filled by hashing
/// names. A second name with the ID of a name in the table is ignored.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct EventNames {
    names: HashMap<ObjectId, String>,
}

impl EventNames {
    /// Returns an empty table.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Adds `name` under its ID. Returns `false` if the table holds a name with that ID.
    pub fn insert(&mut self, name: &str) -> bool {
        let id = ObjectId::from_name(name);
        if self.names.contains_key(&id) {
            return false;
        }

        self.names.insert(id, name.to_owned());
        true
    }

    /// Returns the name of the event `id`, or `None` if no name of the table hashes to it.
    #[must_use]
    pub fn get(&self, id: ObjectId) -> Option<&str> {
        self.names.get(&id).map(String::as_str)
    }

    /// Returns every name with its ID, in no order.
    pub fn iter(&self) -> impl Iterator<Item = (ObjectId, &str)> {
        self.names.iter().map(|(id, name)| (*id, name.as_str()))
    }

    /// Returns the number of names.
    #[must_use]
    pub fn len(&self) -> usize {
        self.names.len()
    }

    /// Returns `true` if the table holds no names.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.names.is_empty()
    }
}

impl<S: AsRef<str>> Extend<S> for EventNames {
    fn extend<T: IntoIterator<Item = S>>(&mut self, names: T) {
        for name in names {
            self.insert(name.as_ref());
        }
    }
}

impl<S: AsRef<str>> FromIterator<S> for EventNames {
    fn from_iter<T: IntoIterator<Item = S>>(names: T) -> Self {
        let mut table = Self::new();
        table.extend(names);
        table
    }
}

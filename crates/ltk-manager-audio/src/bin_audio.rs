//! The audio that one bin names: its bank units and the event names of its sound fields.

use std::io::Cursor;

use ltk_manager_assets::bin_source::BinSource;
use ltk_meta::property::Kind;
use ltk_meta::walk::{Leaf, Node, TreeNode as _, TreeValue, Visit, Visitor};

use crate::bank_set::{
    BANK_EVENTS, BANK_PATH, BANK_UNIT, BANK_UNIT_NAME, BANK_VOICE_OVER, BankUnit, EVENT_FIELDS,
};

/// The bank units and the event names of one bin.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct BinAudio {
    /// Every `BankUnit` node of the bin, in walk order.
    pub units: Vec<BankUnit>,
    /// Every non-empty string of a field in [`EVENT_FIELDS`], and every `BankUnit.events`
    /// entry.
    pub event_names: Vec<String>,
}

impl BinAudio {
    /// Reads the bank units and event names of the bin `bytes`, a `PROP` or a `PTCH`.
    ///
    /// # Errors
    ///
    /// Fails if the bytes are not a bin or a node does not decode.
    pub fn read(bytes: &[u8]) -> Result<Self, ltk_meta::Error> {
        let mut found = Found::default();
        match BinSource::open(Cursor::new(bytes))? {
            BinSource::Stream(mut stream) => {
                stream.walk::<ltk_meta::Error, _>(&mut found)?;
            }
            BinSource::Patch(patch) => {
                patch.walk(&mut found)?;
            }
        }
        Ok(found.0)
    }
}

/// The visitor that collects a [`BinAudio`].
#[derive(Default)]
struct Found(BinAudio);

impl<'a, V: TreeValue<'a>> Visitor<'a, V> for Found {
    type Error = ltk_meta::Error;

    fn enter_node(&mut self, node: &Node<'_, 'a, V>) -> Result<Visit, ltk_meta::Error> {
        let class = node.class_hash();
        let inner = node.inner();

        if class == BANK_UNIT {
            let unit = BankUnit {
                name: text(inner.get(BANK_UNIT_NAME)?)?.unwrap_or_default(),
                bank_path: texts(inner.get(BANK_PATH)?)?,
                events: texts(inner.get(BANK_EVENTS)?)?,
                voice_over: matches!(
                    leaf(inner.get(BANK_VOICE_OVER)?)?,
                    Some(Leaf::Bool(true) | Leaf::Flag(true))
                ),
            };
            self.0.event_names.extend(unit.events.iter().cloned());
            self.0.units.push(unit);
            return Ok(Visit::Continue);
        }

        let Some((_, fields)) = EVENT_FIELDS.iter().find(|(named, _)| *named == class) else {
            return Ok(Visit::Continue);
        };
        for &field in *fields {
            if let Some(name) = text(inner.get(field)?)?
                && !name.is_empty()
            {
                self.0.event_names.push(name);
            }
        }
        Ok(Visit::Continue)
    }
}

fn leaf<'a, V: TreeValue<'a>>(value: Option<V>) -> Result<Option<Leaf<'a>>, ltk_meta::Error> {
    match value {
        Some(value) => value.as_leaf(),
        None => Ok(None),
    }
}

/// Returns the string of `value`, or `None` for a missing field or a field of another kind.
fn text<'a, V: TreeValue<'a>>(value: Option<V>) -> Result<Option<String>, ltk_meta::Error> {
    Ok(match leaf(value)? {
        Some(Leaf::String(text)) => Some(text.to_owned()),
        _ => None,
    })
}

/// Returns the strings of the list `value`. A missing field or a field of another kind is empty.
fn texts<'a, V: TreeValue<'a>>(value: Option<V>) -> Result<Vec<String>, ltk_meta::Error> {
    let Some(value) = value else {
        return Ok(Vec::new());
    };
    if !matches!(value.kind(), Kind::Container | Kind::UnorderedContainer) {
        return Ok(Vec::new());
    }

    let mut items = Vec::new();
    for item in value.children()? {
        let (_, item) = item?;
        if let Some(Leaf::String(text)) = item.as_leaf()? {
            items.push(text.to_owned());
        }
    }
    Ok(items)
}

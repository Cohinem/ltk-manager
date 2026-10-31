//! How the `events` list of a bank unit follows the events of its event bank. "Bank unit
//! events" in `docs/ux/AUDIO.md`.

/// One change to a bank unit's `events` list.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ListEdit {
    /// Sets the item at `index` to `name`.
    Set { index: usize, name: String },
    /// Removes the item at `index`.
    Remove { index: usize },
    /// Appends `name` as the last item.
    Append { name: String },
}

/// Returns the changes that make `events`, a unit's list, follow an edit of its bank that
/// removed the events `removed` and added the events `added`, in the order they apply.
///
/// One removed and one added event are a rename, which sets the old item in its place. Every
/// other removed name leaves the list, the last item first, and every added name that the list
/// does not hold is appended. Names compare without ASCII case, as the client hashes them.
#[must_use]
pub fn events_list_edits(events: &[String], removed: &[String], added: &[String]) -> Vec<ListEdit> {
    let position = |name: &str| {
        events
            .iter()
            .position(|event| event.eq_ignore_ascii_case(name))
    };
    let held = |name: &str| position(name).is_some();

    if let ([old], [new]) = (removed, added)
        && let Some(index) = position(old)
    {
        if held(new) {
            return vec![ListEdit::Remove { index }];
        }
        return vec![ListEdit::Set {
            index,
            name: new.clone(),
        }];
    }

    let mut removals: Vec<usize> = removed.iter().filter_map(|name| position(name)).collect();
    removals.sort_unstable_by(|a, b| b.cmp(a));
    removals.dedup();

    let mut edits: Vec<ListEdit> = removals
        .into_iter()
        .map(|index| ListEdit::Remove { index })
        .collect();
    let mut appended: Vec<&String> = Vec::new();
    for name in added {
        if held(name) || appended.iter().any(|each| each.eq_ignore_ascii_case(name)) {
            continue;
        }
        appended.push(name);
        edits.push(ListEdit::Append { name: name.clone() });
    }
    edits
}

#[cfg(test)]
mod tests;

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::{IntegrationError, Tool};

type Result<T> = std::result::Result<T, IntegrationError>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(super) struct Value {
    kind: u32,
    bytes: Vec<u8>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub(super) struct Tree {
    values: BTreeMap<String, Value>,
    children: BTreeMap<String, Tree>,
}

pub(super) type Snapshot = Vec<Option<Tree>>;

pub(super) fn roots(tool: Tool) -> Vec<String> {
    let (classes, key): (&[&str], &str) = match tool {
        Tool::Wadtools => (&["*", "Directory"], "wadtools"),
        Tool::TexToolz => (
            &[
                r"SystemFileAssociations\.tex",
                r"SystemFileAssociations\.dds",
                r"SystemFileAssociations\.png",
                "Directory",
            ],
            "ltktexutils",
        ),
    };
    classes
        .iter()
        .map(|class| format!(r"Software\Classes\{class}\shell\{key}"))
        .collect()
}

pub(super) fn empty(snapshot: &Snapshot) -> bool {
    snapshot.iter().all(Option::is_none)
}

pub(super) fn targets(snapshot: &Snapshot) -> Vec<String> {
    fn walk(tree: &Tree, result: &mut Vec<String>) {
        if let Some(command) = tree.children.get("command").and_then(|c| c.values.get("")) {
            let words: Vec<u16> = command
                .bytes
                .chunks_exact(2)
                .map(|b| u16::from_le_bytes([b[0], b[1]]))
                .collect();
            let text = String::from_utf16_lossy(&words);
            if let Some(rest) = text.strip_prefix('"')
                && let Some(end) = rest.find('"')
            {
                result.push(rest[..end].to_owned());
            }
        }
        for child in tree.children.values() {
            walk(child, result);
        }
    }
    let mut result = Vec::new();
    for tree in snapshot.iter().flatten() {
        walk(tree, &mut result);
    }
    result
}

#[cfg(test)]
pub(super) fn points_to(tool: Tool, snapshot: &Snapshot, executable: &str) -> bool {
    let commands = targets(snapshot);
    let expected = match tool {
        Tool::Wadtools => 4,
        Tool::TexToolz => 6,
    };
    snapshot.iter().all(Option::is_some)
        && commands.len() == expected
        && commands.iter().all(|p| p.eq_ignore_ascii_case(executable))
}

#[cfg(windows)]
mod native {
    use super::*;
    use winreg::{RegKey, RegValue, enums::*};

    fn read(key: &RegKey, depth: usize, budget: &mut usize) -> Result<Tree> {
        if depth > 8 {
            return Err(IntegrationError::Conflict);
        }
        let mut tree = Tree::default();
        for value in key.enum_values() {
            let (name, value) = value?;
            *budget = budget
                .checked_sub(name.len() + value.bytes.len() + 1)
                .ok_or(IntegrationError::Conflict)?;
            tree.values.insert(
                name,
                Value {
                    kind: value.vtype as u32,
                    bytes: value.bytes,
                },
            );
        }
        for child in key.enum_keys() {
            let name = child?;
            *budget = budget
                .checked_sub(name.len() + 1)
                .ok_or(IntegrationError::Conflict)?;
            tree.children.insert(
                name.clone(),
                read(&key.open_subkey(&name)?, depth + 1, budget)?,
            );
        }
        Ok(tree)
    }

    pub(in crate::integrations) fn snapshot(tool: Tool) -> Result<Snapshot> {
        snapshot_at(&RegKey::predef(HKEY_CURRENT_USER), tool)
    }

    fn snapshot_at(root: &RegKey, tool: Tool) -> Result<Snapshot> {
        let mut budget = 1024 * 1024;
        roots(tool)
            .iter()
            .map(|path| match root.open_subkey(path) {
                Ok(key) => read(&key, 0, &mut budget).map(Some),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
                Err(e) => Err(e.into()),
            })
            .collect()
    }

    fn write(key: &RegKey, tree: &Tree) -> Result<()> {
        for (name, value) in &tree.values {
            let kind = match value.kind {
                0 => REG_NONE,
                1 => REG_SZ,
                2 => REG_EXPAND_SZ,
                3 => REG_BINARY,
                4 => REG_DWORD,
                5 => REG_DWORD_BIG_ENDIAN,
                6 => REG_LINK,
                7 => REG_MULTI_SZ,
                8 => REG_RESOURCE_LIST,
                9 => REG_FULL_RESOURCE_DESCRIPTOR,
                10 => REG_RESOURCE_REQUIREMENTS_LIST,
                11 => REG_QWORD,
                _ => return Err(IntegrationError::InvalidReceipt),
            };
            key.set_raw_value(
                name,
                &RegValue {
                    vtype: kind,
                    bytes: value.bytes.clone(),
                },
            )?;
        }
        for (name, child) in &tree.children {
            write(&key.create_subkey(name)?.0, child)?;
        }
        Ok(())
    }

    pub(in crate::integrations) fn restore(
        tool: Tool,
        expected: &Snapshot,
        desired: &Snapshot,
    ) -> Result<()> {
        restore_at(&RegKey::predef(HKEY_CURRENT_USER), tool, expected, desired)
    }

    fn restore_at(
        root: &RegKey,
        tool: Tool,
        expected: &Snapshot,
        desired: &Snapshot,
    ) -> Result<()> {
        if expected.len() != roots(tool).len() || desired.len() != expected.len() {
            return Err(IntegrationError::InvalidReceipt);
        }
        if &snapshot_at(root, tool)? != expected {
            return Err(IntegrationError::Conflict);
        }
        for (path, tree) in roots(tool).iter().zip(desired) {
            match root.delete_subkey_all(path) {
                Ok(()) => (),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
                Err(e) => return Err(e.into()),
            }
            if let Some(tree) = tree {
                write(&root.create_subkey(path)?.0, tree)?;
            }
        }
        Ok(())
    }

    pub(in crate::integrations) fn handler_path() -> Result<Option<String>> {
        let root = RegKey::predef(HKEY_LOCAL_MACHINE);
        let slot = r"Software\Classes\.tex\shellex\{e357fccd-a995-4576-b01f-234630154e96}";
        let key = match root.open_subkey(slot) {
            Ok(key) => key,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(e.into()),
        };
        let clsid: String = key.get_value("")?;
        let path = root
            .open_subkey(format!(r"Software\Classes\CLSID\{clsid}\InprocServer32"))
            .and_then(|key| key.get_value::<String, _>(""));
        match path {
            Ok(path) => Ok(Some(path)),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(error.into()),
        }
    }
    #[cfg(test)]
    mod tests;
}

#[cfg(windows)]
pub(super) use native::{handler_path, restore, snapshot};

#[cfg(not(windows))]
pub(super) fn snapshot(tool: Tool) -> Result<Snapshot> {
    Ok(vec![None; roots(tool).len()])
}
#[cfg(not(windows))]
pub(super) fn restore(_tool: Tool, _expected: &Snapshot, _desired: &Snapshot) -> Result<()> {
    Err(IntegrationError::Unsupported)
}
#[cfg(not(windows))]
pub(super) fn handler_path() -> Result<Option<String>> {
    Ok(None)
}

fn text(value: &str) -> Value {
    Value {
        kind: 1,
        bytes: value
            .encode_utf16()
            .chain(Some(0))
            .flat_map(u16::to_le_bytes)
            .collect(),
    }
}

pub(super) fn menus(tool: Tool, executable: &str) -> Snapshot {
    let definitions: Vec<Vec<(&str, &str, &str)>> = match tool {
        Tool::Wadtools => vec![
            vec![
                ("extract", "Extract", "\"%1\""),
                (
                    "ripcdragon",
                    "Get CDragon Hashtable (.txt)",
                    "--pause always paths -i \"%1\"",
                ),
                (
                    "ripmimir",
                    "Get Mimir Hashtable (.lhdb)",
                    "--pause always paths -F lhdb -i \"%1\"",
                ),
            ],
            vec![("extractfolder", "Extract all WADs", "\"%1\"")],
        ],
        Tool::TexToolz => vec![
            vec![
                (
                    "topng",
                    "Convert to PNG",
                    "--pause on-error decode --format png \"%1\"",
                ),
                (
                    "todds",
                    "Convert to DDS",
                    "--pause on-error decode --format dds \"%1\"",
                ),
            ],
            vec![("totex", "Convert to TEX", "--pause on-error encode \"%1\"")],
            vec![("totex", "Convert to TEX", "--pause on-error encode \"%1\"")],
            vec![
                (
                    "alltopng",
                    "Convert all .tex to PNG",
                    "--pause always decode --format png \"%1\"",
                ),
                (
                    "alltodds",
                    "Convert all .tex to DDS",
                    "--pause always decode --format dds \"%1\"",
                ),
            ],
        ],
    };
    definitions
        .into_iter()
        .enumerate()
        .map(|(index, verbs)| {
            let name = match tool {
                Tool::Wadtools => "wad toolz",
                Tool::TexToolz => "tex toolz",
            };
            let icon = format!("\"{executable}\",0");
            let mut tree = Tree {
                values: BTreeMap::from([
                    ("MUIVerb".into(), text(name)),
                    ("Icon".into(), text(&icon)),
                    ("SubCommands".into(), text("")),
                ]),
                children: BTreeMap::new(),
            };
            if tool == Tool::Wadtools || index == 0 {
                tree.values.insert("Position".into(), text("Top"));
            }
            if tool == Tool::Wadtools && index == 0 {
                tree.values.insert(
                    "AppliesTo".into(),
                    text("System.FileName:\"*.wad\" OR System.FileName:\"*.wad.*\""),
                );
            }
            let mut shell = Tree::default();
            for (key, label, args) in verbs {
                let command = Tree {
                    values: BTreeMap::from([(
                        "".into(),
                        text(&format!("\"{executable}\" {args}")),
                    )]),
                    children: BTreeMap::new(),
                };
                let verb = Tree {
                    values: BTreeMap::from([
                        ("".into(), text(label)),
                        ("Icon".into(), text(&icon)),
                    ]),
                    children: BTreeMap::from([("command".into(), command)]),
                };
                shell.children.insert(key.into(), verb);
            }
            tree.children.insert("shell".into(), shell);
            Some(tree)
        })
        .collect()
}

/// A partial write can resume only while every observed value belongs to either recorded side.
pub(super) fn can_resume(current: &Snapshot, previous: &Snapshot, target: &Snapshot) -> bool {
    fn subset(current: &Tree, target: &Tree) -> bool {
        current
            .values
            .iter()
            .all(|(name, value)| target.values.get(name) == Some(value))
            && current.children.iter().all(|(name, child)| {
                target
                    .children
                    .get(name)
                    .is_some_and(|expected| subset(child, expected))
            })
    }
    current.len() == previous.len()
        && current.len() == target.len()
        && current
            .iter()
            .zip(previous)
            .zip(target)
            .all(|((current, previous), target)| {
                current == previous
                    || match (current, target) {
                        (None, _) => true,
                        (Some(current), Some(target)) => subset(current, target),
                        _ => false,
                    }
            })
}

pub(super) fn validate_snapshot(tool: Tool, snapshot: &Snapshot) -> Result<()> {
    fn valid(tree: &Tree, depth: usize, budget: &mut usize) -> bool {
        if depth > 8 {
            return false;
        }
        for (name, value) in &tree.values {
            let Some(left) = budget.checked_sub(name.len() + value.bytes.len() + 1) else {
                return false;
            };
            *budget = left;
            if name.contains('\0') || value.kind > 11 {
                return false;
            }
        }
        for (name, child) in &tree.children {
            let Some(left) = budget.checked_sub(name.len() + 1) else {
                return false;
            };
            *budget = left;
            if name.is_empty() || name.contains(['\\', '\0']) || !valid(child, depth + 1, budget) {
                return false;
            }
        }
        true
    }
    let mut budget = 1024 * 1024;
    if snapshot.len() != roots(tool).len()
        || !snapshot
            .iter()
            .flatten()
            .all(|tree| valid(tree, 0, &mut budget))
    {
        return Err(IntegrationError::InvalidReceipt);
    }
    Ok(())
}

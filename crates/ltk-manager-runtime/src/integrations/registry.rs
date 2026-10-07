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
        Tool::RitobinTools => (
            &[
                r"SystemFileAssociations\.bin",
                r"SystemFileAssociations\.rito",
                r"SystemFileAssociations\.ritobin",
                "Directory",
            ],
            "ritobin-tools",
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
                .as_chunks::<2>()
                .0
                .iter()
                .map(|b| u16::from_le_bytes(*b))
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
        Tool::RitobinTools => 7,
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

fn number(value: u32) -> Value {
    Value {
        kind: 4,
        bytes: value.to_le_bytes().into(),
    }
}

/// `ECF_SEPARATORBEFORE`, the `CommandFlags` bit that draws a separator above an entry.
const SEPARATOR_BEFORE: u32 = 0x20;

struct Verb {
    key: &'static str,
    label: &'static str,
    args: &'static str,
    separator_before: bool,
}

/// The submenu of one root, in the order of [`roots`].
struct Menu {
    top: bool,
    applies_to: Option<&'static str>,
    verbs: Vec<Verb>,
}

/// The classic menus that a tool's own `shell install` writes.
struct Layout {
    label: &'static str,
    /// Whether the menu and each entry show the executable's icon.
    icon: bool,
    /// Whether each entry sets `MultiSelectModel`, which lifts Explorer's limit of 15 selected items.
    multi_select: bool,
    menus: Vec<Menu>,
}

fn verb(key: &'static str, label: &'static str, args: &'static str) -> Verb {
    Verb {
        key,
        label,
        args,
        separator_before: false,
    }
}

fn layout(tool: Tool) -> Layout {
    match tool {
        Tool::Wadtools => Layout {
            label: "wad toolz",
            icon: true,
            multi_select: false,
            menus: vec![
                Menu {
                    top: true,
                    applies_to: Some("System.FileName:\"*.wad\" OR System.FileName:\"*.wad.*\""),
                    verbs: vec![
                        verb("extract", "Extract", "\"%1\""),
                        verb(
                            "ripcdragon",
                            "Get CDragon Hashtable (.txt)",
                            "--pause always paths -i \"%1\"",
                        ),
                        verb(
                            "ripmimir",
                            "Get Mimir Hashtable (.lhdb)",
                            "--pause always paths -F lhdb -i \"%1\"",
                        ),
                    ],
                },
                Menu {
                    top: true,
                    applies_to: None,
                    verbs: vec![verb("extractfolder", "Extract all WADs", "\"%1\"")],
                },
            ],
        },
        Tool::TexToolz => {
            let to_tex = || Menu {
                top: false,
                applies_to: None,
                verbs: vec![verb(
                    "totex",
                    "Convert to TEX",
                    "--pause on-error encode \"%1\"",
                )],
            };

            Layout {
                label: "tex toolz",
                icon: true,
                multi_select: false,
                menus: vec![
                    Menu {
                        top: true,
                        applies_to: None,
                        verbs: vec![
                            verb(
                                "topng",
                                "Convert to PNG",
                                "--pause on-error decode --format png \"%1\"",
                            ),
                            verb(
                                "todds",
                                "Convert to DDS",
                                "--pause on-error decode --format dds \"%1\"",
                            ),
                        ],
                    },
                    to_tex(),
                    to_tex(),
                    Menu {
                        top: false,
                        applies_to: None,
                        verbs: vec![
                            verb(
                                "alltopng",
                                "Convert all .tex to PNG",
                                "--pause always decode --format png \"%1\"",
                            ),
                            verb(
                                "alltodds",
                                "Convert all .tex to DDS",
                                "--pause always decode --format dds \"%1\"",
                            ),
                        ],
                    },
                ],
            }
        }
        Tool::RitobinTools => {
            let sync = || Verb {
                separator_before: true,
                ..verb("sync", "Update hashtables", "--pause always hashes sync")
            };
            let to_bin = || Menu {
                top: true,
                applies_to: None,
                verbs: vec![verb(
                    "convert",
                    "Convert to .bin",
                    "--pause on-error convert --to bin \"%1\"",
                )],
            };

            Layout {
                label: "ritobin-tools",
                icon: false,
                multi_select: true,
                menus: vec![
                    Menu {
                        top: false,
                        applies_to: None,
                        verbs: vec![
                            verb(
                                "convert",
                                "Convert to .rito",
                                "--pause on-error convert --to rito \"%1\"",
                            ),
                            sync(),
                        ],
                    },
                    to_bin(),
                    to_bin(),
                    Menu {
                        top: false,
                        applies_to: None,
                        verbs: vec![
                            verb(
                                "convert-bin",
                                "Convert all .bin to .rito",
                                "--pause always convert --recursive --to rito \"%1\"",
                            ),
                            verb(
                                "convert-text",
                                "Convert all .rito to .bin",
                                "--pause always convert --recursive --to bin \"%1\"",
                            ),
                            sync(),
                        ],
                    },
                ],
            }
        }
    }
}

pub(super) fn menus(tool: Tool, executable: &str) -> Snapshot {
    let layout = layout(tool);
    let icon = format!("\"{executable}\",0");

    layout
        .menus
        .into_iter()
        .map(|menu| {
            let mut tree = Tree::default();
            tree.values.insert("MUIVerb".into(), text(layout.label));
            tree.values.insert("SubCommands".into(), text(""));
            if layout.icon {
                tree.values.insert("Icon".into(), text(&icon));
            }
            if menu.top {
                tree.values.insert("Position".into(), text("Top"));
            }
            if let Some(filter) = menu.applies_to {
                tree.values.insert("AppliesTo".into(), text(filter));
            }

            let mut shell = Tree::default();
            for entry in menu.verbs {
                let mut command = Tree::default();
                command
                    .values
                    .insert("".into(), text(&format!("\"{executable}\" {}", entry.args)));

                let mut verb = Tree::default();
                verb.values.insert("".into(), text(entry.label));
                if layout.icon {
                    verb.values.insert("Icon".into(), text(&icon));
                }
                if layout.multi_select {
                    verb.values
                        .insert("MultiSelectModel".into(), text("Player"));
                }
                if entry.separator_before {
                    verb.values
                        .insert("CommandFlags".into(), number(SEPARATOR_BEFORE));
                }
                verb.children.insert("command".into(), command);

                shell.children.insert(entry.key.into(), verb);
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

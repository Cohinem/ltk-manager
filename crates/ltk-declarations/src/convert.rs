//! Converts a layer's JSON and TOML declaration files to YAML.
//!
//! This module parses both formats itself, because `ltk_game_data` refuses them.

use std::path::{Path, PathBuf};

use fs_err as fs;
use ltk_game_data::{ReferencedInputs, load_declarations};
use rowan::ast::AstNode as _;
use serde_json::Value;
use yaml_edit::YamlNode;

use crate::line_ending::LineEnding;
use crate::{Error, FILE_NAME, locate, present_manifests, resolve_source, syntax, write_file};

/// The YAML text of a converted file and where it goes.
#[derive(Debug)]
struct Converted {
    path: PathBuf,
    text: String,
}

/// The writes and removals that convert one layer.
#[derive(Debug)]
struct Conversion {
    manifest: Converted,
    /// The JSON or TOML manifest that `manifest` replaces. `None` for a YAML manifest, which
    /// `manifest` overwrites.
    old_manifest: Option<PathBuf>,
    sources: Vec<Converted>,
    old_sources: Vec<PathBuf>,
}

/// Converts the JSON and TOML manifest and source files of the layer at `layer_dir` to YAML.
///
/// Returns the files that the conversion removed. Returns an empty list if the layer holds no
/// such file. The converted text must load and must read back as the original values before
/// anything is written.
///
/// # Errors
///
/// [`Error::Invalid`] if the layer holds more than one manifest, a file does not parse or load,
/// or a `.yaml` file already exists at a converted path. [`Error::Io`] if a file cannot be read,
/// written or removed. A failed write or a failed manifest removal restores the layer.
pub fn convert_layer(layer_dir: impl AsRef<Path>) -> Result<Vec<PathBuf>, Error> {
    let layer_dir = layer_dir.as_ref();

    let present = present_manifests(layer_dir);
    let manifest = match present.as_slice() {
        [] => return Ok(Vec::new()),
        [path] => path,
        [first, ..] => {
            return Err(Error::Invalid {
                path: first.clone(),
                message: "the layer holds more than one game data manifest".to_owned(),
            });
        }
    };

    match Conversion::plan(layer_dir, manifest)? {
        Some(conversion) => conversion.apply(),
        None => Ok(Vec::new()),
    }
}

impl Conversion {
    /// Plans the conversion of the layer whose manifest is `manifest`. Returns `None` if the
    /// manifest and its sources are all YAML.
    fn plan(layer_dir: &Path, manifest: &Path) -> Result<Option<Self>, Error> {
        let bytes = fs::read(manifest)?;
        let text = std::str::from_utf8(&bytes).map_err(|_| invalid(manifest, "not UTF-8"))?;

        let (converted, old_manifest, names) = if is_deprecated(&manifest.to_string_lossy()) {
            let mut document = parse_deprecated(manifest, text)?;
            let names = respell_document_sources(&mut document);
            let converted = Converted {
                path: layer_dir.join(FILE_NAME),
                text: to_yaml(manifest, &document)?,
            };
            (converted, Some(manifest.to_owned()), names)
        } else {
            let name = manifest.to_string_lossy();
            let inputs = ReferencedInputs::discover(&name, text)
                .map_err(|error| invalid(manifest, error))?;
            let names = deprecated_only(inputs.sources);
            if names.is_empty() {
                return Ok(None);
            }

            let flat = text.replace("\r\n", "\n");
            let respelled =
                respell_yaml_sources(&flat).map_err(|error| invalid(manifest, error))?;
            let converted = Converted {
                path: manifest.to_owned(),
                text: LineEnding::of(&bytes).apply(&respelled),
            };
            (converted, None, names)
        };

        let mut sources = Vec::with_capacity(names.len());
        let mut old_sources = Vec::with_capacity(names.len());
        for name in &names {
            let old = resolve_source(layer_dir, name).map_err(|error| invalid(manifest, error))?;
            let text = fs::read_to_string(&old)?;
            let document = parse_deprecated(&old, &text)?;
            let Some(path) = yaml_name(name).map(|name| layer_dir.join(name)) else {
                continue;
            };

            let taken = path.exists() || sources.iter().any(|held: &Converted| held.path == path);
            if taken {
                return Err(invalid(&path, "the file already exists"));
            }

            sources.push(Converted {
                text: to_yaml(&old, &document)?,
                path,
            });
            old_sources.push(old);
        }

        let conversion = Self {
            manifest: converted,
            old_manifest,
            sources,
            old_sources,
        };
        conversion.verify(layer_dir)?;
        Ok(Some(conversion))
    }

    /// Fails if the converted manifest still names a deprecated file or does not load.
    fn verify(&self, layer_dir: &Path) -> Result<(), Error> {
        let path = &self.manifest.path;
        let name = path.to_string_lossy();
        let text = &self.manifest.text;

        let inputs =
            ReferencedInputs::discover(&name, text).map_err(|error| invalid(path, error))?;
        if !deprecated_only(inputs.sources).is_empty() {
            return Err(invalid(path, "a source path could not be rewritten"));
        }

        load_declarations(&name, text, |source| {
            let converted = self
                .sources
                .iter()
                .find(|held| held.path == layer_dir.join(source));
            if let Some(converted) = converted {
                return Ok(converted.text.clone());
            }

            let resolved = resolve_source(layer_dir, source)?;
            fs::read_to_string(&resolved).map_err(|error| ltk_game_data::Error::io(source, &error))
        })
        .map_err(|error| invalid(path, error))?;

        Ok(())
    }

    /// Writes the YAML files, then removes the old ones.
    fn apply(self) -> Result<Vec<PathBuf>, Error> {
        let mut created = Vec::with_capacity(self.sources.len() + 1);
        let undo = |created: &[PathBuf]| {
            for path in created {
                let _ = fs::remove_file(path);
            }
        };

        for source in &self.sources {
            if let Some(parent) = source.path.parent() {
                fs::create_dir_all(parent)?;
            }
            if let Err(error) = write_file(&source.path, source.text.as_bytes()) {
                undo(&created);
                return Err(error);
            }
            created.push(source.path.clone());
        }

        if let Err(error) = write_file(&self.manifest.path, self.manifest.text.as_bytes()) {
            undo(&created);
            return Err(error);
        }

        let mut removed = Vec::with_capacity(self.old_sources.len() + 1);
        if let Some(old) = self.old_manifest {
            // Two manifests make the layer fail to load, so the new one goes if the old one stays.
            created.push(self.manifest.path);
            if let Err(error) = fs::remove_file(&old) {
                undo(&created);
                return Err(error.into());
            }
            removed.push(old);
        }

        for old in self.old_sources {
            fs::remove_file(&old)?;
            removed.push(old);
        }
        Ok(removed)
    }
}

fn invalid(path: &Path, message: impl std::fmt::Display) -> Error {
    Error::Invalid {
        path: path.to_owned(),
        message: message.to_string(),
    }
}

/// Whether the extension of `name` is JSON or TOML, compared ASCII case-insensitively.
fn is_deprecated(name: &str) -> bool {
    name.rsplit_once('.').is_some_and(|(_, extension)| {
        extension.eq_ignore_ascii_case("json") || extension.eq_ignore_ascii_case("toml")
    })
}

/// Returns `name` with a `.yaml` extension if its extension is JSON or TOML.
fn yaml_name(name: &str) -> Option<String> {
    if !is_deprecated(name) {
        return None;
    }

    let (stem, _) = name.rsplit_once('.')?;
    Some(format!("{stem}.yaml"))
}

/// Returns the JSON and TOML names of `names`, each once, in order.
fn deprecated_only(names: Vec<String>) -> Vec<String> {
    let mut kept: Vec<String> = Vec::with_capacity(names.len());
    for name in names {
        if is_deprecated(&name) && !kept.contains(&name) {
            kept.push(name);
        }
    }
    kept
}

/// Parses `text` by the extension of `path`.
fn parse_deprecated(path: &Path, text: &str) -> Result<Value, Error> {
    let is_toml = path
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("toml"));

    if is_toml {
        toml::from_str(text).map_err(|error| invalid(path, error))
    } else {
        serde_json::from_str(text).map_err(|error| invalid(path, error))
    }
}

/// Writes `document` as YAML. Fails if the YAML does not read back as the same values.
fn to_yaml(path: &Path, document: &Value) -> Result<String, Error> {
    let text = serde_saphyr::to_string(document).map_err(|error| invalid(path, error))?;

    let read: Value = serde_saphyr::from_str(&text).map_err(|error| invalid(path, error))?;
    if read != *document {
        return Err(invalid(
            path,
            "the YAML text does not read back as the same values",
        ));
    }

    Ok(text)
}

/// Rewrites each JSON or TOML `source` of a manifest document to its YAML name, and returns
/// the old names.
fn respell_document_sources(document: &mut Value) -> Vec<String> {
    let mut names = Vec::new();
    let mut respell = |body: &mut Value| {
        let Some(source) = body.get_mut("source") else {
            return;
        };
        let Some(renamed) = source.as_str().and_then(yaml_name) else {
            return;
        };

        if let Some(old) = source.as_str() {
            names.push(old.to_owned());
        }
        *source = Value::String(renamed);
    };

    let modules = document.get_mut("modules").and_then(Value::as_array_mut);
    for module in modules.into_iter().flatten() {
        respell(module);

        let entries = module.get_mut("entries").and_then(Value::as_object_mut);
        for entry in entries.into_iter().flat_map(|entries| entries.values_mut()) {
            respell(entry);
        }
    }

    deprecated_only(names)
}

/// Rewrites each JSON or TOML `source` of a YAML manifest to its YAML name. Every other byte
/// of `text` stays. `text` has `\n` line endings.
fn respell_yaml_sources(text: &str) -> Result<String, crate::Refusal> {
    let document = syntax::parse(text)?;

    let mut scalars = Vec::new();
    for module in locate::module_mappings(&document) {
        scalars.extend(module.get("source"));

        let Some(entries) = module.get_mapping("entries") else {
            continue;
        };
        for entry in syntax::entries(&entries) {
            if let Some(body) = syntax::mapping_value(&entry) {
                scalars.extend(body.get("source"));
            }
        }
    }

    let mut splices = Vec::with_capacity(scalars.len());
    for node in &scalars {
        let YamlNode::Scalar(scalar) = node else {
            continue;
        };
        let decoded = scalar.as_string();
        let Some(renamed) = yaml_name(&decoded) else {
            continue;
        };

        let spelled = scalar.value();
        let start = syntax::start(scalar.syntax());
        if text[start..].starts_with(&spelled) && spelled.contains(&decoded) {
            let replacement = spelled.replacen(&decoded, &renamed, 1);
            splices.push((start, start + spelled.len(), replacement));
        }
    }

    let mut respelled = text.to_owned();
    splices.sort_by_key(|(start, _, _)| std::cmp::Reverse(*start));
    for (start, end, replacement) in splices {
        respelled.replace_range(start..end, &replacement);
    }
    Ok(respelled)
}

#[cfg(test)]
mod tests;

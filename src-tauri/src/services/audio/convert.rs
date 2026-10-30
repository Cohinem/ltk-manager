//! The WEM of a file that a media replacement takes: a `.wem` as it is, or another format
//! converted to Vorbis by the Wwise console. "Replacing media" in `docs/ux/AUDIO.md`.

use std::path::{Path, PathBuf};
use std::process::Command;

use fs_err as fs;
use ltk_manager_audio::ltk_wwise::wem::{WemCodec, WemInfo};
use ltk_manager_base::config::AudioSettings;
use ltk_manager_base::error::{AppError, DomainError, ErrorKind};
use serde::{Deserialize, Serialize};

/// The extension of a file that a replacement takes as it is.
const WEM_EXTENSION: &str = "wem";

/// The extensions of the files that the Wwise console converts.
pub const CONVERTED_EXTENSIONS: &[&str] = &["wav", "ogg", "flac"];

/// The conversion ShareSet of a new Wwise project that writes Vorbis.
const VORBIS_CONVERSION: &str = "Vorbis Quality High";

/// Why a file gives no WEM for a replacement.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, thiserror::Error, specta::Type)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum AudioConvertError {
    /// The file needs the Wwise console, and the settings name none.
    #[error("a .{extension} file converts through the Wwise console, and no path to it is set")]
    NoConsole { extension: String },
    /// The file is neither a WEM nor of a format that the Wwise console converts.
    #[error("a .{extension} file is neither a WEM nor a format that the Wwise console converts")]
    Format { extension: String },
    /// The Wwise console ran and wrote no Vorbis WEM. `detail` is its output.
    #[error("the Wwise console wrote no Vorbis WEM: {detail}")]
    Failed { detail: String },
}

impl From<AudioConvertError> for AppError {
    fn from(error: AudioConvertError) -> Self {
        Self::Domain(DomainError::new(ErrorKind::Preview, error))
    }
}

/// Returns the WEM of the file at `file`: its bytes for a `.wem`, else the Vorbis WEM that the
/// Wwise console of `settings` converts it into.
///
/// # Errors
///
/// Fails with [`AudioConvertError::NoConsole`] for a format that needs the console when no path
/// to it is set, with [`AudioConvertError::Format`] for any other format, and with
/// [`AudioConvertError::Failed`] if the console writes no Vorbis WEM. Fails if a file cannot be
/// read or written.
pub fn wem_of(file: &Path, settings: &AudioSettings) -> Result<Vec<u8>, AppError> {
    let extension = file
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if extension == WEM_EXTENSION {
        return Ok(fs::read(file)?);
    }
    if !CONVERTED_EXTENSIONS.contains(&extension.as_str()) {
        return Err(AudioConvertError::Format { extension }.into());
    }

    let Some(console) = &settings.wwise_console_path else {
        return Err(AudioConvertError::NoConsole { extension }.into());
    };
    convert(console, file)
}

/// Converts `file` into a Vorbis WEM with `WwiseConsole.exe convert-external-source`, in a
/// temporary Wwise project that the console creates first.
///
/// The commands and the `.wsources` list follow the Wwise command line reference. No run of them
/// is recorded for the bank version that the game reads, so a WEM that the console writes is
/// checked to be Vorbis before it is used.
fn convert(console: &Path, file: &Path) -> Result<Vec<u8>, AppError> {
    let work = std::env::temp_dir().join(format!("ltk-manager-wwise-{}", uuid::Uuid::new_v4()));
    let result = convert_in(console, file, &work);
    if let Err(error) = fs::remove_dir_all(&work) {
        tracing::warn!(?work, %error, "Failed to remove the Wwise console work folder");
    }
    result
}

fn convert_in(console: &Path, file: &Path, work: &Path) -> Result<Vec<u8>, AppError> {
    let input = work.join("input");
    fs::create_dir_all(&input)?;
    let name = file
        .file_name()
        .ok_or_else(|| AppError::InvalidPath(file.display().to_string()))?;
    fs::copy(file, input.join(name))?;

    let project = work.join("project").join("project.wproj");
    run(Command::new(console)
        .arg("create-new-project")
        .arg(&project)
        .args(["--platform", "Windows", "--quiet"]))?;

    let list = work.join("sources.wsources");
    fs::write(&list, sources_list(&input, &name.to_string_lossy()))?;
    let output = work.join("output");
    run(Command::new(console)
        .arg("convert-external-source")
        .arg(&project)
        .arg("--source-file")
        .arg(&list)
        .arg("--output")
        .arg(&output)
        .arg("--quiet"))?;

    let wem = first_wem(&output).ok_or_else(|| AudioConvertError::Failed {
        detail: format!("no .wem under {}", output.display()),
    })?;
    let bytes = fs::read(wem)?;
    match WemInfo::from_bytes(&bytes) {
        Ok(info) if info.codec == WemCodec::VORBIS => Ok(bytes),
        Ok(info) => Err(AudioConvertError::Failed {
            detail: format!("the WEM is codec {:#06x}", info.codec.0),
        }
        .into()),
        Err(error) => Err(AudioConvertError::Failed {
            detail: error.to_string(),
        }
        .into()),
    }
}

/// Returns the `.wsources` list of the one source `name` in `root`, converted to Vorbis.
fn sources_list(root: &Path, name: &str) -> String {
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <ExternalSourcesList SchemaVersion=\"1\" Root=\"{}\">\n\
         \t<Source Path=\"{}\" Conversion=\"{VORBIS_CONVERSION}\"/>\n\
         </ExternalSourcesList>\n",
        xml_text(&root.display().to_string()),
        xml_text(name),
    )
}

fn xml_text(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// Runs `command`, and fails with its output if it does not exit with success.
fn run(command: &mut Command) -> Result<(), AppError> {
    let output = command.output()?;
    if output.status.success() {
        return Ok(());
    }

    let mut detail = String::from_utf8_lossy(&output.stderr).trim().to_owned();
    if detail.is_empty() {
        detail = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    }
    Err(AudioConvertError::Failed { detail }.into())
}

/// Returns the first `.wem` file below `folder`.
fn first_wem(folder: &Path) -> Option<PathBuf> {
    walkdir::WalkDir::new(folder)
        .into_iter()
        .filter_map(Result::ok)
        .map(walkdir::DirEntry::into_path)
        .find(|path| {
            path.extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case(WEM_EXTENSION))
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wem_of_refuses_wav_without_console() {
        let error = wem_of(Path::new("voice.wav"), &AudioSettings::default()).unwrap_err();

        assert_eq!(
            error.domain::<AudioConvertError>(),
            Some(&AudioConvertError::NoConsole {
                extension: "wav".to_owned()
            })
        );
    }

    #[test]
    fn wem_of_refuses_other_format() {
        let error = wem_of(Path::new("voice.mp4"), &AudioSettings::default()).unwrap_err();

        assert!(matches!(
            error.domain::<AudioConvertError>(),
            Some(AudioConvertError::Format { .. })
        ));
    }

    #[test]
    fn sources_list_names_root_and_vorbis_conversion() {
        let list = sources_list(Path::new("C:/work/input"), "a&b.wav");

        assert!(list.contains("Root=\"C:/work/input\""));
        assert!(list.contains("Path=\"a&amp;b.wav\" Conversion=\"Vorbis Quality High\""));
    }
}

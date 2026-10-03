//! Explorer file types for the mod archive formats, registered for the current user.
//!
//! See `docs/adr/0060-mod-file-types-are-registered-per-user-by-the-app.md`.

use std::path::Path;

use serde::{Deserialize, Serialize};

use super::IntegrationError;

type Result<T> = std::result::Result<T, IntegrationError>;

/// A mod archive format Explorer opens with the manager.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum ModFileType {
    /// A `.fantome` archive.
    Fantome,
    /// A `.modpkg` package.
    Modpkg,
}

impl ModFileType {
    /// Both formats, in the order the settings page lists them.
    pub const ALL: [Self; 2] = [Self::Fantome, Self::Modpkg];

    /// The extension, without its leading dot.
    pub fn extension(self) -> &'static str {
        match self {
            Self::Fantome => "fantome",
            Self::Modpkg => "modpkg",
        }
    }

    /// The type a path's extension names, ignoring case.
    pub fn of(path: &Path) -> Option<Self> {
        let extension = path.extension()?.to_str()?;

        Self::ALL
            .into_iter()
            .find(|ty| ty.extension().eq_ignore_ascii_case(extension))
    }

    #[cfg_attr(not(windows), allow(dead_code))]
    fn prog_id(self) -> &'static str {
        match self {
            Self::Fantome => "LTKManager.Fantome",
            Self::Modpkg => "LTKManager.Modpkg",
        }
    }

    #[cfg_attr(not(windows), allow(dead_code))]
    fn type_name(self) -> &'static str {
        match self {
            Self::Fantome => "Fantome mod",
            Self::Modpkg => "Mod package",
        }
    }

    #[cfg_attr(not(windows), allow(dead_code))]
    fn icon(self) -> &'static str {
        match self {
            Self::Fantome => "fantome.ico",
            Self::Modpkg => "modpkg.ico",
        }
    }
}

/// The program Explorer opens a mod file type with.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FileTypeOwner {
    /// This executable.
    Manager,
    /// Another program, by the name Windows shows for it.
    Other { program: String },
    /// No program, so Windows asks which one to use.
    Unassigned,
}

/// One mod file type and the program that opens it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct FileTypeStatus {
    pub file_type: ModFileType,
    pub owner: FileTypeOwner,
}

/// The name the app is listed under in Windows' Default apps page.
#[cfg_attr(not(windows), allow(dead_code))]
const APP_NAME: &str = "LTK Manager";

/// Register both types for the current user, opening with `executable` and drawing the icons
/// in `icons`.
///
/// A type another program already opens keeps that program, because only Windows' own prompt
/// may take a default from it.
///
/// # Errors
/// Fails off Windows, or when a registry write is refused.
pub fn register(executable: &Path, icons: &Path) -> Result<()> {
    #[cfg(windows)]
    {
        let root = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
        if native::register_at(&root, executable, icons)? {
            native::notify();
        }

        Ok(())
    }

    #[cfg(not(windows))]
    {
        let _ = (executable, icons);
        Err(IntegrationError::Unsupported)
    }
}

/// Remove what [`register`] wrote, keeping whatever another program added beside it.
///
/// # Errors
/// Fails when a registry key cannot be read or removed.
pub fn unregister(executable: &Path) -> Result<()> {
    #[cfg(windows)]
    {
        let root = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
        if native::unregister_at(&root, executable)? {
            native::notify();
        }
    }

    #[cfg(not(windows))]
    let _ = executable;

    Ok(())
}

/// Which program opens each type, as Explorer resolves it. Empty off Windows.
pub fn status(executable: &Path) -> Vec<FileTypeStatus> {
    #[cfg(windows)]
    {
        ModFileType::ALL
            .into_iter()
            .map(|file_type| FileTypeStatus {
                file_type,
                owner: native::owner(file_type, executable),
            })
            .collect()
    }

    #[cfg(not(windows))]
    {
        let _ = executable;
        Vec::new()
    }
}

/// Open the manager's page in Windows' Default apps settings.
///
/// # Errors
/// Fails off Windows, or when the shell refuses the settings URI.
pub fn open_default_apps() -> Result<()> {
    #[cfg(windows)]
    {
        native::open_default_apps()
    }

    #[cfg(not(windows))]
    Err(IntegrationError::Unsupported)
}

#[cfg(windows)]
mod native {
    use std::path::Path;
    use std::ptr;

    use windows_sys::Win32::UI::Shell::{
        ASSOCF_INIT_IGNOREUNKNOWN, ASSOCF_NOTRUNCATE, ASSOCSTR, ASSOCSTR_EXECUTABLE,
        ASSOCSTR_FRIENDLYAPPNAME, AssocQueryStringW, SHCNE_ASSOCCHANGED, SHCNF_IDLIST,
        SHChangeNotify, ShellExecuteW,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    use winreg::enums::{KEY_READ, KEY_WRITE, REG_NONE};
    use winreg::{RegKey, RegValue};

    use super::{APP_NAME, FileTypeOwner, IntegrationError, ModFileType, Result};

    const CLASSES: &str = r"Software\Classes";
    const VENDOR: &str = r"Software\LeagueToolkit";
    const MANAGER: &str = r"Software\LeagueToolkit\Manager";
    const CAPABILITIES: &str = r"Software\LeagueToolkit\Manager\Capabilities";
    const REGISTERED_APPLICATIONS: &str = r"Software\RegisteredApplications";
    const APP_DESCRIPTION: &str = "Installs and manages League of Legends mods.";
    /// `registeredAppUser` takes the URI-escaped `APP_NAME`.
    const DEFAULT_APPS_URI: &str = "ms-settings:defaultapps?registeredAppUser=LTK%20Manager";

    pub(super) fn register_at(root: &RegKey, executable: &Path, icons: &Path) -> Result<bool> {
        let command = format!("\"{}\" \"%1\"", executable.display());
        let mut changed = false;

        for ty in ModFileType::ALL {
            let (prog_id, _) = root.create_subkey(prog_id_key(ty))?;
            let icon = icons.join(ty.icon());
            changed |= set_text(&prog_id, "", ty.type_name())?;
            changed |= set_text(
                &prog_id.create_subkey("DefaultIcon")?.0,
                "",
                &icon.to_string_lossy(),
            )?;
            changed |= set_text(
                &prog_id.create_subkey(r"shell\open\command")?.0,
                "",
                &command,
            )?;

            let (extension, _) = root.create_subkey(extension_key(ty))?;
            changed |= set_marker(&extension.create_subkey("OpenWithProgids")?.0, ty.prog_id())?;

            let default = extension.get_value::<String, _>("").unwrap_or_default();
            if default.is_empty() {
                changed |= set_text(&extension, "", ty.prog_id())?;
            }
        }

        let (application, _) = root.create_subkey(application_key(executable)?)?;
        changed |= set_text(&application, "FriendlyAppName", APP_NAME)?;

        let (supported, _) = application.create_subkey("SupportedTypes")?;
        for ty in ModFileType::ALL {
            changed |= set_text(&supported, &dotted(ty), "")?;
        }

        let (capabilities, _) = root.create_subkey(CAPABILITIES)?;
        changed |= set_text(&capabilities, "ApplicationName", APP_NAME)?;
        changed |= set_text(&capabilities, "ApplicationDescription", APP_DESCRIPTION)?;

        let (associations, _) = capabilities.create_subkey("FileAssociations")?;
        for ty in ModFileType::ALL {
            changed |= set_text(&associations, &dotted(ty), ty.prog_id())?;
        }

        let (registered, _) = root.create_subkey(REGISTERED_APPLICATIONS)?;
        changed |= set_text(&registered, APP_NAME, CAPABILITIES)?;

        Ok(changed)
    }

    pub(super) fn unregister_at(root: &RegKey, executable: &Path) -> Result<bool> {
        let mut changed = false;

        for ty in ModFileType::ALL {
            changed |= delete_tree(root, &prog_id_key(ty))?;

            let extension = extension_key(ty);
            let open_with = format!(r"{extension}\OpenWithProgids");
            changed |= delete_value(root, &open_with, ty.prog_id())?;

            let names_manager = open(root, &extension)?
                .and_then(|key| key.get_value::<String, _>("").ok())
                .is_some_and(|default| default == ty.prog_id());
            if names_manager {
                changed |= delete_value(root, &extension, "")?;
            }

            prune(root, &[&open_with, &extension])?;
        }

        let application = application_key(executable)?;
        let supported = format!(r"{application}\SupportedTypes");
        for ty in ModFileType::ALL {
            changed |= delete_value(root, &supported, &dotted(ty))?;
        }
        changed |= delete_value(root, &application, "FriendlyAppName")?;
        prune(root, &[&supported, &application])?;

        changed |= delete_tree(root, CAPABILITIES)?;
        prune(root, &[MANAGER, VENDOR])?;

        changed |= delete_value(root, REGISTERED_APPLICATIONS, APP_NAME)?;

        Ok(changed)
    }

    pub(super) fn owner(ty: ModFileType, executable: &Path) -> FileTypeOwner {
        let extension = dotted(ty);
        let Some(opener) = query(ASSOCSTR_EXECUTABLE, &extension) else {
            return FileTypeOwner::Unassigned;
        };

        let manager = executable.to_string_lossy();
        if opener.replace('/', "\\").eq_ignore_ascii_case(&manager) {
            return FileTypeOwner::Manager;
        }

        let program = query(ASSOCSTR_FRIENDLYAPPNAME, &extension).unwrap_or(opener);
        FileTypeOwner::Other { program }
    }

    pub(super) fn open_default_apps() -> Result<()> {
        let verb = wide("open");
        let uri = wide(DEFAULT_APPS_URI);

        // SAFETY: both strings are NUL-terminated and outlive the call.
        let instance = unsafe {
            ShellExecuteW(
                ptr::null_mut(),
                verb.as_ptr(),
                uri.as_ptr(),
                ptr::null(),
                ptr::null(),
                SW_SHOWNORMAL,
            )
        };

        // Anything at or below 32 is an error code rather than a handle.
        if instance as isize <= 32 {
            return Err(std::io::Error::last_os_error().into());
        }

        Ok(())
    }

    pub(super) fn notify() {
        // SAFETY: `SHCNE_ASSOCCHANGED` takes no items.
        unsafe {
            SHChangeNotify(
                SHCNE_ASSOCCHANGED as i32,
                SHCNF_IDLIST,
                ptr::null(),
                ptr::null(),
            );
        }
    }

    /// An association string for `extension`, or `None` where Windows knows no program.
    fn query(what: ASSOCSTR, extension: &str) -> Option<String> {
        let extension = wide(extension);
        let mut buffer = vec![0u16; 1024];
        let mut length = buffer.len() as u32;

        /* Without IGNOREUNKNOWN, an extension nothing opens answers with the
        "Open with" dialog's executable. */
        // SAFETY: the buffer holds `length` characters and the extension is NUL-terminated.
        let result = unsafe {
            AssocQueryStringW(
                ASSOCF_INIT_IGNOREUNKNOWN | ASSOCF_NOTRUNCATE,
                what,
                extension.as_ptr(),
                ptr::null(),
                buffer.as_mut_ptr(),
                &mut length,
            )
        };
        if result != 0 {
            return None;
        }

        let end = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
        let text = String::from_utf16_lossy(&buffer[..end]);

        (!text.is_empty()).then_some(text)
    }

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(Some(0)).collect()
    }

    fn dotted(ty: ModFileType) -> String {
        format!(".{}", ty.extension())
    }

    fn prog_id_key(ty: ModFileType) -> String {
        format!(r"{CLASSES}\{}", ty.prog_id())
    }

    fn extension_key(ty: ModFileType) -> String {
        format!(r"{CLASSES}\{}", dotted(ty))
    }

    /// The `Applications` entry Explorer's "Open with" list reads for the executable.
    fn application_key(executable: &Path) -> Result<String> {
        let name = executable
            .file_name()
            .ok_or_else(|| IntegrationError::Operation {
                detail: format!("{} names no file", executable.display()),
            })?;

        Ok(format!(
            r"{CLASSES}\Applications\{}",
            name.to_string_lossy()
        ))
    }

    fn open(root: &RegKey, path: &str) -> Result<Option<RegKey>> {
        match root.open_subkey_with_flags(path, KEY_READ | KEY_WRITE) {
            Ok(key) => Ok(Some(key)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Write a string value unless it already holds `value`.
    fn set_text(key: &RegKey, name: &str, value: &str) -> Result<bool> {
        if key
            .get_value::<String, _>(name)
            .is_ok_and(|current| current == value)
        {
            return Ok(false);
        }

        key.set_value(name, &value)?;
        Ok(true)
    }

    /// Write the empty `REG_NONE` value an `OpenWithProgids` entry is, unless one is there.
    fn set_marker(key: &RegKey, name: &str) -> Result<bool> {
        if key.get_raw_value(name).is_ok() {
            return Ok(false);
        }

        key.set_raw_value(
            name,
            &RegValue {
                vtype: REG_NONE,
                bytes: Vec::new(),
            },
        )?;
        Ok(true)
    }

    fn delete_value(root: &RegKey, path: &str, name: &str) -> Result<bool> {
        let Some(key) = open(root, path)? else {
            return Ok(false);
        };

        match key.delete_value(name) {
            Ok(()) => Ok(true),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(e) => Err(e.into()),
        }
    }

    fn delete_tree(root: &RegKey, path: &str) -> Result<bool> {
        match root.delete_subkey_all(path) {
            Ok(()) => Ok(true),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(e) => Err(e.into()),
        }
    }

    /// Remove each key in turn while it holds nothing, stopping at the first that still does.
    fn prune(root: &RegKey, paths: &[&str]) -> Result<()> {
        for path in paths {
            let Some(key) = open(root, path)? else {
                continue;
            };

            let info = key.query_info()?;
            if info.sub_keys > 0 || info.values > 0 {
                return Ok(());
            }

            drop(key);
            root.delete_subkey(path)?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests;

use std::path::Path;

use super::*;

#[test]
fn a_path_names_its_type_by_extension_whatever_the_case() {
    assert_eq!(
        ModFileType::of(Path::new(r"C:\mods\Ahri.FANTOME")),
        Some(ModFileType::Fantome)
    );
    assert_eq!(
        ModFileType::of(Path::new("skin.modpkg")),
        Some(ModFileType::Modpkg)
    );
    assert_eq!(ModFileType::of(Path::new("skin.zip")), None);
    assert_eq!(ModFileType::of(Path::new("fantome")), None);
}

#[cfg(windows)]
mod native {
    use std::path::Path;

    use winreg::RegKey;
    use winreg::enums::HKEY_CURRENT_USER;

    use super::super::native::{register_at, unregister_at};

    const EXE: &str = r"C:\Program Files\LTK Manager\ltk-manager.exe";
    const ICONS: &str = r"C:\Program Files\LTK Manager\file-icons";

    struct TestKey {
        root: RegKey,
        path: String,
    }

    impl TestKey {
        fn new() -> Self {
            let path = format!(
                r"Software\LeagueToolkit\Manager\Tests\{}",
                uuid::Uuid::new_v4()
            );
            let root = RegKey::predef(HKEY_CURRENT_USER)
                .create_subkey(&path)
                .unwrap()
                .0;

            Self { root, path }
        }

        fn text(&self, key: &str, name: &str) -> Option<String> {
            self.root.open_subkey(key).ok()?.get_value(name).ok()
        }

        fn has_value(&self, key: &str, name: &str) -> bool {
            self.root
                .open_subkey(key)
                .is_ok_and(|key| key.get_raw_value(name).is_ok())
        }

        fn has_key(&self, key: &str) -> bool {
            self.root.open_subkey(key).is_ok()
        }

        /// Every value under the scratch key, however deep.
        fn values(&self) -> usize {
            fn count(key: &RegKey) -> usize {
                let own = key.enum_values().count();
                let nested: usize = key
                    .enum_keys()
                    .map(|name| count(&key.open_subkey(name.unwrap()).unwrap()))
                    .sum();

                own + nested
            }

            count(&self.root)
        }
    }

    impl Drop for TestKey {
        fn drop(&mut self) {
            let _ = RegKey::predef(HKEY_CURRENT_USER).delete_subkey_all(&self.path);
        }
    }

    fn register(test: &TestKey, executable: &str) -> bool {
        register_at(&test.root, Path::new(executable), Path::new(ICONS)).unwrap()
    }

    #[test]
    fn registering_names_the_manager_for_both_types() {
        let test = TestKey::new();

        assert!(register(&test, EXE));

        assert_eq!(
            test.text(r"Software\Classes\.fantome", "").as_deref(),
            Some("LTKManager.Fantome")
        );
        assert_eq!(
            test.text(r"Software\Classes\.modpkg", "").as_deref(),
            Some("LTKManager.Modpkg")
        );
        assert!(test.has_value(
            r"Software\Classes\.fantome\OpenWithProgids",
            "LTKManager.Fantome"
        ));
        assert_eq!(
            test.text(
                r"Software\Classes\LTKManager.Fantome\shell\open\command",
                ""
            )
            .as_deref(),
            Some(format!("\"{EXE}\" \"%1\"").as_str())
        );
        assert_eq!(
            test.text(r"Software\Classes\LTKManager.Modpkg\DefaultIcon", "")
                .as_deref(),
            Some(format!(r"{ICONS}\modpkg.ico").as_str())
        );
        assert!(test.has_value(
            r"Software\Classes\Applications\ltk-manager.exe\SupportedTypes",
            ".modpkg"
        ));
        assert_eq!(
            test.text(
                r"Software\LeagueToolkit\Manager\Capabilities\FileAssociations",
                ".fantome"
            )
            .as_deref(),
            Some("LTKManager.Fantome")
        );
        assert_eq!(
            test.text(r"Software\RegisteredApplications", "LTK Manager")
                .as_deref(),
            Some(r"Software\LeagueToolkit\Manager\Capabilities")
        );
    }

    #[test]
    fn registering_again_changes_nothing() {
        let test = TestKey::new();
        register(&test, EXE);

        assert!(!register(&test, EXE));
    }

    #[test]
    fn registering_from_a_moved_executable_rewrites_the_command() {
        let test = TestKey::new();
        register(&test, EXE);

        assert!(register(&test, r"D:\Apps\ltk-manager.exe"));

        assert_eq!(
            test.text(r"Software\Classes\LTKManager.Modpkg\shell\open\command", "")
                .as_deref(),
            Some(r#""D:\Apps\ltk-manager.exe" "%1""#)
        );
    }

    #[test]
    fn registering_keeps_another_programs_default() {
        let test = TestKey::new();
        let (extension, _) = test
            .root
            .create_subkey(r"Software\Classes\.fantome")
            .unwrap();
        extension.set_value("", &"7-Zip.zip").unwrap();

        register(&test, EXE);

        assert_eq!(
            test.text(r"Software\Classes\.fantome", "").as_deref(),
            Some("7-Zip.zip")
        );
        assert!(test.has_value(
            r"Software\Classes\.fantome\OpenWithProgids",
            "LTKManager.Fantome"
        ));
    }

    #[test]
    fn unregistering_removes_every_value_the_manager_wrote() {
        let test = TestKey::new();
        register(&test, EXE);

        assert!(unregister_at(&test.root, Path::new(EXE)).unwrap());

        assert_eq!(test.values(), 0);
        assert!(!test.has_key(r"Software\Classes\.fantome"));
        assert!(!test.has_key(r"Software\Classes\Applications\ltk-manager.exe"));
        assert!(!unregister_at(&test.root, Path::new(EXE)).unwrap());
    }

    #[test]
    fn unregistering_keeps_what_other_programs_wrote() {
        let test = TestKey::new();
        let (extension, _) = test
            .root
            .create_subkey(r"Software\Classes\.fantome")
            .unwrap();
        let (open_with, _) = extension.create_subkey("OpenWithProgids").unwrap();
        open_with.set_value("7-Zip.zip", &"").unwrap();
        let (shell, _) = test
            .root
            .create_subkey(r"Software\Classes\Applications\ltk-manager.exe\shell\open\command")
            .unwrap();
        shell.set_value("", &"chosen in Open with").unwrap();
        let (registered, _) = test
            .root
            .create_subkey(r"Software\RegisteredApplications")
            .unwrap();
        registered.set_value("Other", &"Software\\Other").unwrap();
        register(&test, EXE);
        extension.set_value("", &"7-Zip.zip").unwrap();

        unregister_at(&test.root, Path::new(EXE)).unwrap();

        assert_eq!(
            test.text(r"Software\Classes\.fantome", "").as_deref(),
            Some("7-Zip.zip")
        );
        assert!(test.has_value(r"Software\Classes\.fantome\OpenWithProgids", "7-Zip.zip"));
        assert!(!test.has_value(
            r"Software\Classes\.fantome\OpenWithProgids",
            "LTKManager.Fantome"
        ));
        assert!(test.has_key(r"Software\Classes\Applications\ltk-manager.exe\shell"));
        assert!(!test.has_key(r"Software\Classes\Applications\ltk-manager.exe\SupportedTypes"));
        assert!(!test.has_key(r"Software\Classes\.modpkg"));
        assert!(!test.has_key(r"Software\LeagueToolkit"));
        assert!(test.has_value(r"Software\RegisteredApplications", "Other"));
        assert!(!test.has_value(r"Software\RegisteredApplications", "LTK Manager"));
    }
}

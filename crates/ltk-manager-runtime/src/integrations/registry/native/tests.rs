use super::*;

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
}
impl Drop for TestKey {
    fn drop(&mut self) {
        let _ = RegKey::predef(HKEY_CURRENT_USER).delete_subkey_all(&self.path);
    }
}

#[test]
fn classic_menus_restore_the_previous_installation_and_refuse_a_changed_owner() {
    let test = TestKey::new();
    for tool in [Tool::Wadtools, Tool::TexToolz, Tool::RitobinTools] {
        let empty = snapshot_at(&test.root, tool).unwrap();
        let previous = menus(tool, r"C:\standalone\tool.exe");
        restore_at(&test.root, tool, &empty, &previous).unwrap();
        let managed = menus(tool, r"C:\Users\Ján Smith\managed\tool.exe");
        restore_at(&test.root, tool, &previous, &managed).unwrap();
        assert_eq!(snapshot_at(&test.root, tool).unwrap(), managed);
        let foreign = menus(tool, r"C:\another\tool.exe");
        restore_at(&test.root, tool, &managed, &foreign).unwrap();
        assert!(matches!(
            restore_at(&test.root, tool, &managed, &previous),
            Err(IntegrationError::Conflict)
        ));
        assert_eq!(snapshot_at(&test.root, tool).unwrap(), foreign);
        restore_at(&test.root, tool, &foreign, &managed).unwrap();
        restore_at(&test.root, tool, &managed, &previous).unwrap();
        assert_eq!(snapshot_at(&test.root, tool).unwrap(), previous);
    }
}

#[test]
fn ritobin_menus_match_upstream_shell_install() {
    let test = TestKey::new();
    let tool = Tool::RitobinTools;
    let empty = snapshot_at(&test.root, tool).unwrap();
    let managed = menus(tool, r"C:\Tools\ritobin-tools.exe");
    restore_at(&test.root, tool, &empty, &managed).unwrap();

    let text = |key: &RegKey, name: &str| key.get_value::<String, _>(name).ok();
    let menu = |extension: &str| {
        test.root
            .open_subkey(format!(
                r"Software\Classes\SystemFileAssociations\{extension}\shell\ritobin-tools"
            ))
            .unwrap()
    };

    let bin = menu(".bin");
    assert_eq!(text(&bin, "MUIVerb").as_deref(), Some("ritobin-tools"));
    assert_eq!(text(&bin, "SubCommands").as_deref(), Some(""));
    assert_eq!(text(&bin, "Position"), None);
    assert_eq!(text(&bin, "Icon"), None);

    let convert = bin.open_subkey(r"shell\convert").unwrap();
    assert_eq!(text(&convert, "").as_deref(), Some("Convert to .rito"));
    assert_eq!(
        text(&convert, "MultiSelectModel").as_deref(),
        Some("Player")
    );
    assert!(convert.get_value::<u32, _>("CommandFlags").is_err());
    assert_eq!(
        text(&convert.open_subkey("command").unwrap(), "").as_deref(),
        Some(r#""C:\Tools\ritobin-tools.exe" --pause on-error convert --to rito "%1""#)
    );

    let sync = bin.open_subkey(r"shell\sync").unwrap();
    assert_eq!(sync.get_value::<u32, _>("CommandFlags").unwrap(), 0x20);
    assert_eq!(
        text(&sync.open_subkey("command").unwrap(), "").as_deref(),
        Some(r#""C:\Tools\ritobin-tools.exe" --pause always hashes sync"#)
    );

    for extension in [".rito", ".ritobin"] {
        assert_eq!(text(&menu(extension), "Position").as_deref(), Some("Top"));
    }
}

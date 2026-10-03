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
    for tool in [Tool::Wadtools, Tool::TexToolz] {
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

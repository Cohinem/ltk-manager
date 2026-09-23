use super::*;
use std::io::Write;

fn installation(tool: Tool) -> Installation {
    Installation {
        directory: uuid::Uuid::new_v4().to_string(),
        tag: "v0.5.7".into(),
        files: BTreeMap::from([(tool.executable().into(), "a".repeat(64))]),
    }
}

#[test]
fn a_receipt_cannot_name_files_outside_its_installation() {
    let mut receipt = Receipt::new(Tool::Wadtools);
    let mut install = installation(Tool::Wadtools);
    install.files.insert("../other.exe".into(), "a".repeat(64));
    receipt.active = Some(install);
    assert!(matches!(
        validate_receipt(Tool::Wadtools, &receipt),
        Err(IntegrationError::InvalidReceipt)
    ));
}

#[test]
fn a_receipt_cannot_name_an_external_directory() {
    let mut receipt = Receipt::new(Tool::Wadtools);
    let mut install = installation(Tool::Wadtools);
    install.directory = "../../external".into();
    receipt.active = Some(install);
    assert!(validate_receipt(Tool::Wadtools, &receipt).is_err());
}

#[test]
fn cleanup_preserves_configuration_and_user_outputs() {
    let temp = tempfile::tempdir().unwrap();
    let integrations = Integrations {
        root: temp.path().into(),
    };
    let install = installation(Tool::Wadtools);
    let dir = integrations.directory(Tool::Wadtools, &install);
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("wadtools.exe"), b"binary").unwrap();
    fs::write(dir.join("wadtools.toml"), b"configuration").unwrap();
    fs::write(dir.join("output.txt"), b"user output").unwrap();
    let mut receipt = Receipt::new(Tool::Wadtools);
    receipt.retired.push(install);
    integrations.cleanup(Tool::Wadtools, &mut receipt);
    assert!(receipt.retired.is_empty());
    assert!(fs::metadata(dir.join("wadtools.exe")).is_err());
    assert_eq!(
        fs::read(dir.join("wadtools.toml")).unwrap(),
        b"configuration"
    );
    assert_eq!(fs::read(dir.join("output.txt")).unwrap(), b"user output");
}

#[test]
fn missing_receipt_is_an_uninstalled_tool() {
    let temp = tempfile::tempdir().unwrap();
    let integrations = Integrations {
        root: temp.path().into(),
    };
    let receipt = integrations.read(Tool::Wadtools).unwrap();
    assert!(receipt.active.is_none());
    assert!(!receipt.menu_enabled);
}

#[test]
fn a_newer_receipt_is_not_treated_as_uninstalled() {
    let temp = tempfile::tempdir().unwrap();
    let integrations = Integrations {
        root: temp.path().into(),
    };
    let mut receipt = Receipt::new(Tool::Wadtools);
    receipt.schema = 2;
    integrations.save(Tool::Wadtools, &receipt).unwrap();
    assert!(matches!(
        integrations.read(Tool::Wadtools),
        Err(IntegrationError::InvalidReceipt)
    ));
}

#[test]
fn changed_payload_is_never_executed_for_registration() {
    let temp = tempfile::tempdir().unwrap();
    let install = installation(Tool::Wadtools);
    fs::write(temp.path().join("wadtools.exe"), b"different payload").unwrap();
    assert!(matches!(
        verify_files(temp.path(), &install),
        Err(IntegrationError::Integrity)
    ));
}

#[test]
fn release_tags_cannot_be_used_as_paths() {
    for tag in ["../v1.0.0", "v1.0.0/other", "v1.0.0-rc.1", "latest"] {
        assert!(releases::validate_tag(tag).is_err(), "{tag}");
    }
    assert!(releases::validate_tag("v0.5.7").is_ok());
}

#[test]
fn an_asset_without_integrity_metadata_is_not_installable() {
    let release = releases::Release { tag_name: "v0.5.7".into(), prerelease: false, draft: false,
        assets: vec![releases::Asset { name: "wadtools-0.5.7-windows-x64.zip".into(), size: 10,
            browser_download_url: "https://github.com/LeagueToolkit/wadtools/releases/download/v0.5.7/wadtools-0.5.7-windows-x64.zip".into(), digest: None }] };
    assert!(releases::assets(Tool::Wadtools, &release).is_err());
}

#[test]
fn tex_requires_the_executable_and_the_companion_dll_from_one_release() {
    let release = releases::Release { tag_name: "v0.3.0".into(), prerelease: false, draft: false,
        assets: vec![releases::Asset { name: "ltk-tex-utils-windows.exe".into(), size: 10,
            browser_download_url: "https://github.com/LeagueToolkit/ltk-tex-utils/releases/download/v0.3.0/ltk-tex-utils-windows.exe".into(), digest: Some(format!("sha256:{}", "a".repeat(64))) }] };
    assert!(releases::assets(Tool::TexToolz, &release).is_err());
}

#[test]
fn an_archive_must_contain_exactly_one_executable() {
    let temp = tempfile::tempdir().unwrap();
    let archive_path = temp.path().join("release.zip");
    let mut zip = zip::ZipWriter::new(fs::File::create(&archive_path).unwrap());
    zip.start_file("README.md", zip::write::SimpleFileOptions::default())
        .unwrap();
    zip.write_all(b"no executable").unwrap();
    zip.finish().unwrap();
    assert!(releases::extract_wad(&archive_path, &temp.path().join("wadtools.exe")).is_err());
}

#[test]
fn interrupted_registry_writes_resume_without_replacing_new_owners() {
    let old = registry::menus(Tool::Wadtools, r"C:\old\wadtools.exe");
    let target = registry::menus(Tool::Wadtools, r"C:\new\wadtools.exe");
    let mut partial = old.clone();
    partial[0] = target[0].clone();
    assert!(registry::can_resume(&partial, &old, &target));
    partial[1] = None;
    assert!(registry::can_resume(&partial, &old, &target));
    let foreign = registry::menus(Tool::Wadtools, r"C:\other\wadtools.exe");
    partial[1] = foreign[1].clone();
    assert!(!registry::can_resume(&partial, &old, &target));
}

#[test]
fn context_menus_quote_paths_and_cover_every_supported_surface() {
    for tool in TOOLS {
        let executable = format!(r"C:\Users\Ján Smith\tool\{}", tool.executable());
        let menus = registry::menus(tool, &executable);
        assert_eq!(menus.len(), registry::roots(tool).len());
        assert!(registry::points_to(tool, &menus, &executable));
        assert!(!registry::points_to(tool, &menus, r"C:\other.exe"));
    }
}

fn download_fixture(
    body: &'static [u8],
    expected_digest: String,
) -> (releases::Asset, std::thread::JoinHandle<()>) {
    use std::io::Read;
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let server = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut request = [0u8; 4096];
        let received = stream.read(&mut request).unwrap();
        assert!(received > 0);
        let header = format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        );
        let _ = stream.write_all(header.as_bytes());
        let _ = stream.write_all(body);
    });
    (
        releases::Asset {
            name: "payload.exe".into(),
            browser_download_url: format!("http://{address}/payload"),
            digest: Some(format!("sha256:{expected_digest}")),
            size: body.len() as u64,
        },
        server,
    )
}

#[test]
fn a_download_rejects_bytes_that_do_not_match_the_release() {
    let (asset, server) = download_fixture(b"payload", "0".repeat(64));
    let dir = tempfile::tempdir().unwrap();
    let result = releases::download(&asset, &dir.path().join("payload.exe"), |_, _| Ok(()));
    server.join().unwrap();
    assert!(matches!(result, Err(IntegrationError::Integrity)));
}

#[test]
fn a_verified_download_reports_progress_and_keeps_exact_bytes() {
    use sha2::{Digest, Sha256};
    let (asset, server) = download_fixture(b"payload", format!("{:x}", Sha256::digest(b"payload")));
    let dir = tempfile::tempdir().unwrap();
    let destination = dir.path().join("payload.exe");
    let mut last = 0;
    releases::download(&asset, &destination, |received, total| {
        assert!(received <= total);
        last = received;
        Ok(())
    })
    .unwrap();
    server.join().unwrap();
    assert_eq!(last, 7);
    assert_eq!(fs::read(destination).unwrap(), b"payload");
}

#[test]
#[ignore = "downloads official release payloads and executes only --version in temporary directories"]
fn published_windows_releases_stage_and_verify_without_registering_anything() {
    let temp = tempfile::tempdir().unwrap();
    let integrations = Integrations {
        root: temp.path().into(),
    };
    for tool in TOOLS {
        let release = releases::resolve(tool, None).unwrap();
        let install = integrations.stage(tool, &release).unwrap();
        assert_eq!(install.tag, release.tag_name);
        verify_files(&integrations.directory(tool, &install), &install).unwrap();
        assert!(integrations.read(tool).unwrap().active.is_none());
    }
}

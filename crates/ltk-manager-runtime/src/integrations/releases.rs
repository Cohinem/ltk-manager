use std::io::{Read, Write};
use std::path::Path;
use std::time::Duration;

use fs_err as fs;
use reqwest::blocking::Client;
use serde::Deserialize;
use sha2::{Digest, Sha256};

use super::{IntegrationError, IntegrationRelease, Tool};

type Result<T> = std::result::Result<T, IntegrationError>;
// Release binaries are currently far below this bound.
const MAX_ASSET: u64 = 256 * 1024 * 1024;

#[derive(Debug, Deserialize)]
pub(super) struct Asset {
    pub name: String,
    pub browser_download_url: String,
    pub digest: Option<String>,
    pub size: u64,
}

#[derive(Debug, Deserialize)]
pub(super) struct Release {
    pub tag_name: String,
    pub prerelease: bool,
    pub draft: bool,
    pub assets: Vec<Asset>,
}

pub(super) fn client() -> Result<Client> {
    Ok(Client::builder()
        .user_agent("ltk-manager-integrations")
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(300))
        .build()?)
}

pub(super) fn resolve(tool: Tool, tag: Option<&str>) -> Result<Release> {
    let endpoint = match tag {
        Some(tag) => {
            validate_tag(tag)?;
            format!("tags/{tag}")
        }
        None => "latest".to_owned(),
    };
    let response = client()?
        .get(format!(
            "https://api.github.com/repos/LeagueToolkit/{}/releases/{endpoint}",
            tool.repo()
        ))
        .timeout(Duration::from_secs(20))
        .send()?
        .error_for_status()?;
    let mut bytes = Vec::new();
    response.take(1024 * 1024).read_to_end(&mut bytes)?;
    let release: Release = serde_json::from_slice(&bytes)?;
    validate_tag(&release.tag_name)?;
    let version = semver::Version::parse(release.tag_name.trim_start_matches('v'))
        .map_err(|_| contract("invalid release version"))?;
    let minor = match tool {
        Tool::Wadtools => 5,
        Tool::TexToolz => 3,
    };
    if version.major != 0 || version.minor != minor {
        return Err(contract(
            "this tool version needs a newer integration adapter",
        ));
    }
    if release.prerelease || release.draft {
        return Err(contract("stable release required"));
    }
    assets(tool, &release)?;
    Ok(release)
}

pub(super) fn summary(tool: Tool, release: &Release) -> IntegrationRelease {
    IntegrationRelease {
        tag: release.tag_name.clone(),
        url: format!(
            "https://github.com/LeagueToolkit/{}/releases/tag/{}",
            tool.repo(),
            release.tag_name
        ),
    }
}

pub(super) fn validate_tag(tag: &str) -> Result<()> {
    let version = semver::Version::parse(tag.strip_prefix('v').unwrap_or(tag))
        .map_err(|_| contract("invalid release tag"))?;
    if !version.pre.is_empty() || tag.len() > 80 {
        return Err(contract("stable release required"));
    }
    Ok(())
}

pub(super) fn assets(tool: Tool, release: &Release) -> Result<Vec<&Asset>> {
    let names = match tool {
        Tool::Wadtools => vec![format!(
            "wadtools-{}-windows-x64.zip",
            release.tag_name.trim_start_matches('v')
        )],
        Tool::TexToolz => vec![
            "ltk-tex-utils-windows.exe".into(),
            "ltk-tex-thumb-handler.dll".into(),
        ],
    };
    names
        .iter()
        .map(|name| {
            let mut matching = release.assets.iter().filter(|a| &a.name == name);
            let asset = matching
                .next()
                .ok_or_else(|| contract("required Windows asset missing"))?;
            if matching.next().is_some() || asset.size == 0 || asset.size > MAX_ASSET {
                return Err(contract("invalid asset size or duplicate asset"));
            }
            digest(asset)?;
            let prefix = format!(
                "https://github.com/LeagueToolkit/{}/releases/download/{}/",
                tool.repo(),
                release.tag_name
            );
            if !asset.browser_download_url.starts_with(&prefix) {
                return Err(contract("unexpected download origin"));
            }
            Ok(asset)
        })
        .collect()
}

fn digest(asset: &Asset) -> Result<&str> {
    asset
        .digest
        .as_deref()
        .and_then(|s| s.strip_prefix("sha256:"))
        .filter(|s| s.len() == 64 && s.bytes().all(|c| c.is_ascii_hexdigit()))
        .ok_or_else(|| contract("release asset has no SHA-256 digest"))
}

pub(super) fn download(
    asset: &Asset,
    destination: &Path,
    mut progress: impl FnMut(u64, u64) -> Result<()>,
) -> Result<()> {
    let mut response = client()?
        .get(&asset.browser_download_url)
        .send()?
        .error_for_status()?;
    let mut file = fs::File::create(destination)?;
    let mut hash = Sha256::new();
    let mut downloaded = 0u64;
    let mut buffer = [0u8; 64 * 1024];
    loop {
        progress(downloaded, asset.size)?;
        let count = response.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        downloaded += count as u64;
        if downloaded > asset.size {
            return Err(IntegrationError::Integrity);
        }
        hash.update(&buffer[..count]);
        file.write_all(&buffer[..count])?;
    }
    file.sync_all()?;
    if downloaded != asset.size
        || !format!("{:x}", hash.finalize()).eq_ignore_ascii_case(digest(asset)?)
    {
        return Err(IntegrationError::Integrity);
    }
    Ok(())
}

pub(super) fn hash(path: &Path) -> Result<String> {
    let mut file = fs::File::open(path)?;
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hash.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hash.finalize()))
}

pub(super) fn extract_wad(zip: &Path, destination: &Path) -> Result<()> {
    let file = fs::File::open(zip)?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| contract(&e.to_string()))?;
    let mut found = false;
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|e| contract(&e.to_string()))?;
        let name = entry
            .enclosed_name()
            .ok_or_else(|| contract("unsafe archive path"))?;
        if name.file_name().is_some_and(|name| name == "wadtools.exe") {
            if found
                || entry.is_dir()
                || entry.size() > MAX_ASSET
                || entry
                    .unix_mode()
                    .is_some_and(|mode| mode & 0o170000 == 0o120000)
            {
                return Err(contract("invalid executable archive entry"));
            }
            let mut output = fs::File::create(destination)?;
            std::io::copy(&mut entry.by_ref().take(MAX_ASSET + 1), &mut output)?;
            output.sync_all()?;
            found = true;
        }
    }
    if !found {
        return Err(contract("archive has no wadtools.exe"));
    }
    Ok(())
}

pub(super) fn contract(detail: &str) -> IntegrationError {
    IntegrationError::Release {
        detail: detail.to_owned(),
    }
}

//! The formats a webview decodes from a file's own bytes: an image it draws, and the video
//! and audio it plays.
//!
//! The game and the League client name their files by a hash a reference carries, so the
//! bytes say which format a chunk is in.

use serde::Serialize;

/// How far into a file the SVG test reads for the root element.
const SVG_SNIFF_LIMIT: usize = 1024;

/// An image the webview draws from the file's own bytes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "lowercase")]
pub enum WebImage {
    Svg,
    Gif,
    Webp,
    Bmp,
    Ico,
}

impl WebImage {
    /// The web image `bytes` hold, or `None` for anything else.
    pub(super) fn sniff(bytes: &[u8]) -> Option<Self> {
        match image::guess_format(bytes) {
            Ok(image::ImageFormat::Gif) => Some(Self::Gif),
            Ok(image::ImageFormat::WebP) => Some(Self::Webp),
            Ok(image::ImageFormat::Bmp) => Some(Self::Bmp),
            Ok(image::ImageFormat::Ico) => Some(Self::Ico),
            _ => is_svg(bytes).then_some(Self::Svg),
        }
    }

    /// The MIME type an `<img>` decodes the bytes under.
    pub(super) fn mime(self) -> &'static str {
        match self {
            Self::Svg => "image/svg+xml",
            Self::Gif => "image/gif",
            Self::Webp => "image/webp",
            Self::Bmp => "image/bmp",
            Self::Ico => "image/x-icon",
        }
    }
}

/// Whether `bytes` read as an SVG document.
///
/// SVG has no signature, so the test is markup that opens with a tag and names an `<svg>`
/// root near its start. A script or a JSON file that mentions `<svg` in a string does not
/// open with a tag, and an HTML page holding an inline SVG opens as HTML.
fn is_svg(bytes: &[u8]) -> bool {
    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(SVG_SNIFF_LIMIT)]);
    let head = head.trim_start_matches('\u{feff}').trim_start();

    if !head.starts_with('<') {
        return false;
    }

    let lower = head.to_ascii_lowercase();
    !lower.starts_with("<!doctype html") && !lower.starts_with("<html") && lower.contains("<svg")
}

/// The MIME type a `<video>` or an `<audio>` plays `bytes` under, by their signature.
pub(super) fn media_mime(bytes: &[u8]) -> Option<&'static str> {
    const EBML: [u8; 4] = [0x1a, 0x45, 0xdf, 0xa3];

    if bytes.starts_with(&EBML) {
        return Some("video/webm");
    }
    if bytes.starts_with(b"OggS") {
        return Some("audio/ogg");
    }
    if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WAVE") {
        return Some("audio/wav");
    }
    if bytes.get(4..8) == Some(b"ftyp") {
        return Some("video/mp4");
    }
    if bytes.starts_with(b"ID3") || matches!(bytes, [0xff, 0xfb | 0xf3 | 0xf2, ..]) {
        return Some("audio/mpeg");
    }
    None
}

#[cfg(test)]
mod tests;

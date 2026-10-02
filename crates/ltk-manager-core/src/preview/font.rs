//! One OpenType or TrueType file, served as its own bytes for a webview `FontFace` to load.

use super::{PreviewError, PreviewFont};

/// The `sfnt` version of a TrueType outline font.
const TRUE_TYPE: [u8; 4] = [0, 1, 0, 0];

/// The `sfnt` version Apple's TrueType fonts carry.
const APPLE_TRUE_TYPE: [u8; 4] = *b"true";

/// The `sfnt` version of an OpenType font with CFF outlines.
const OPEN_TYPE: [u8; 4] = *b"OTTO";

/// The font `bytes` hold, under the MIME type its `sfnt` version names.
///
/// # Errors
///
/// Fails with [`PreviewError::NotFont`] for anything else, a font collection included.
pub(super) fn render(bytes: Vec<u8>) -> Result<PreviewFont, PreviewError> {
    let mime = match bytes.first_chunk::<4>() {
        Some(&OPEN_TYPE) => "font/otf",
        Some(&TRUE_TYPE | &APPLE_TRUE_TYPE) => "font/ttf",
        _ => return Err(PreviewError::NotFont),
    };

    Ok(PreviewFont { bytes, mime })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_sfnt_version_answers_its_mime_type() {
        assert_eq!(render(b"OTTO....".to_vec()).unwrap().mime, "font/otf");
        assert_eq!(render(vec![0, 1, 0, 0, 9]).unwrap().mime, "font/ttf");
        assert_eq!(render(b"true....".to_vec()).unwrap().mime, "font/ttf");
    }

    #[test]
    fn a_collection_or_other_file_is_not_a_font() {
        assert!(matches!(
            render(b"ttcf....".to_vec()),
            Err(PreviewError::NotFont)
        ));
        assert!(matches!(
            render(b"TEX".to_vec()),
            Err(PreviewError::NotFont)
        ));
    }
}

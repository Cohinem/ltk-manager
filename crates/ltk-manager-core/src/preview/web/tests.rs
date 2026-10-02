use super::*;

#[test]
fn an_svg_is_markup_naming_an_svg_root() {
    assert_eq!(
        WebImage::sniff(br#"<svg xmlns="http://www.w3.org/2000/svg"/>"#),
        Some(WebImage::Svg)
    );
    assert_eq!(
        WebImage::sniff(b"\xef\xbb\xbf  <?xml version=\"1.0\"?>\n<!-- icon -->\n<svg></svg>"),
        Some(WebImage::Svg)
    );
}

/* A chunk's name is its hash, so a script mentioning an SVG would otherwise be served as one. */
#[test]
fn text_that_mentions_svg_is_no_svg() {
    assert_eq!(WebImage::sniff(br#"const icon = "<svg></svg>";"#), None);
    assert_eq!(WebImage::sniff(br#"{"icon": "<svg/>"}"#), None);
    assert_eq!(
        WebImage::sniff(b"<!DOCTYPE html><html><body><svg></svg></body></html>"),
        None
    );
}

#[test]
fn a_raster_web_image_is_read_off_its_signature() {
    assert_eq!(
        WebImage::sniff(b"GIF89a\x01\x00\x01\x00"),
        Some(WebImage::Gif)
    );
    assert_eq!(
        WebImage::sniff(b"RIFF\x24\x00\x00\x00WEBPVP8 "),
        Some(WebImage::Webp)
    );
    assert_eq!(WebImage::sniff(b"\x89PNG\r\n\x1a\n"), None);
}

#[test]
fn media_plays_under_the_type_its_signature_names() {
    assert_eq!(
        media_mime(&[0x1a, 0x45, 0xdf, 0xa3, 0x01]),
        Some("video/webm")
    );
    assert_eq!(media_mime(b"OggS\x00\x02"), Some("audio/ogg"));
    assert_eq!(
        media_mime(b"RIFF\x24\x00\x00\x00WAVEfmt "),
        Some("audio/wav")
    );
    assert_eq!(media_mime(b"\x00\x00\x00\x18ftypmp42"), Some("video/mp4"));
    assert_eq!(media_mime(b"ID3\x04\x00"), Some("audio/mpeg"));
    assert_eq!(media_mime(b"{\"json\": true}"), None);
}

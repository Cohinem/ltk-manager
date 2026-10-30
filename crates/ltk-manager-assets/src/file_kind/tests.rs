use super::*;

#[test]
fn from_extension_names_wem_as_wwise_media() {
    assert_eq!(
        WorkshopFileKind::from_extension("wem"),
        WorkshopFileKind::WwiseMedia
    );
    assert_eq!(
        WorkshopFileKind::from_extension("WEM"),
        WorkshopFileKind::WwiseMedia
    );
    assert_eq!(
        WorkshopFileKind::from_extension("wpk"),
        WorkshopFileKind::WwisePackage
    );
    assert_eq!(
        WorkshopFileKind::from_extension("xyz"),
        WorkshopFileKind::Unknown
    );
}

#[test]
fn or_signature_reads_riff_wave_of_unknown_file_as_wwise_media() {
    let wem = b"RIFF\x24\x00\x00\x00WAVEfmt ";

    assert_eq!(
        WorkshopFileKind::or_signature(WorkshopFileKind::Unknown, wem),
        WorkshopFileKind::WwiseMedia
    );
    assert_eq!(
        WorkshopFileKind::or_signature(WorkshopFileKind::Unknown, b"RIFF\x24\x00\x00\x00WEBP"),
        WorkshopFileKind::Unknown
    );
    assert_eq!(
        WorkshopFileKind::or_signature(WorkshopFileKind::Png, wem),
        WorkshopFileKind::Png
    );
}

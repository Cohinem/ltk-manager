//! Print every `StaticMaterialDef` of a bin inside a WAD as the engine builds its passes.
//!
//! ```text
//! cargo run -p ltk-manager-core --example dump_passes -- <wad> <chunk path> [<shaders wad>]
//! ```
//!
//! One JSON line per material, the [`ResolvedMaterial`] the shader pipeline binds, with no
//! names and no assets located. `<shaders wad>` is `Global.wad.client` or
//! `Shaders/Shaders.wad.client`, which `data/shaders/shaders.bin` is read from. Without it
//! every pass lists only what the material writes.

use fs_err as fs;
use ltk_hash::{BinHash, Hash as _};
use ltk_manager_core::bin_document::BinDocument;
use ltk_manager_core::material::SHADER_DEFS_PATH;
use ltk_manager_core::material::pass::{ResolvedMaterial, resolve_passes};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let (wad_path, chunk_path, shaders_wad) = match args.as_slice() {
        [wad, chunk] => (wad, chunk, None),
        [wad, chunk, shaders] => (wad, chunk, Some(shaders)),
        _ => {
            eprintln!("usage: dump_passes <wad> <chunk path> [<shaders wad>]");
            std::process::exit(2);
        }
    };

    let document = BinDocument::parse(chunk(wad_path, chunk_path)).expect("parse bin");
    let shaders = shaders_wad
        .map(|wad| BinDocument::parse(chunk(wad, SHADER_DEFS_PATH)).expect("parse shaders.bin"));

    let material_class = BinHash::hash_str("StaticMaterialDef");
    let materials: Vec<ResolvedMaterial> = document
        .entries()
        .filter(|entry| {
            document
                .object_at(*entry)
                .is_some_and(|object| object.class_hash == material_class)
        })
        .map(|entry| {
            resolve_passes(&document, entry, &(), &(), shaders.as_ref()).expect("an object")
        })
        .collect();
    for material in &materials {
        println!("{}", serde_json::to_string(material).expect("serialize"));
    }
    eprintln!("{} materials", materials.len());
}

fn chunk(wad_path: &str, chunk_path: &str) -> Vec<u8> {
    let file = fs::File::open(wad_path).expect("open wad");
    let mut wad = ltk_wad::Wad::mount(file).expect("mount wad");
    let chunk_hash = ltk_modpkg::ChunkPath::new(chunk_path).hash().value();
    let chunk = *wad
        .chunks()
        .get(ltk_wad::WadHash(chunk_hash))
        .expect("chunk in wad");
    wad.load_chunk_decompressed(&chunk)
        .expect("read chunk")
        .into_vec()
}

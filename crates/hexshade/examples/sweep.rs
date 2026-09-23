//! Translate every record of a shader's two TOCs out of an installed
//! `ShaderCache.dx11.wad.client`, and write a `pairs.json` a WebGL2 link test reads.
//!
//! ```text
//! cargo run --release -p hexshade --example sweep -- <wad> <out dir> <object path>...
//! ```
//!
//! Writes `<out dir>/<shader>/<id>.{vs,ps}.glsl` for every shader id the TOCs list, prints
//! one line per failure, and ends with a count per stage. `pairs.json` pairs each id's
//! two stages where both translated.

use fs_err as fs;
use std::collections::BTreeSet;
use std::io::BufReader;
use std::path::Path;
use std::time::Instant;

use hexshade::bundle::{bundle_path, chunk_hash, index_in_bundle, read_toc, record, toc_path};
use hexshade::dxbc::reflect;
use hexshade::{Stage, translate};
use ltk_wad::Wad;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let [wad_path, out_dir, object_paths @ ..] = args.as_slice() else {
        eprintln!("usage: sweep <wad> <out dir> <object path>...");
        std::process::exit(2);
    };

    let mut wad = Wad::mount(BufReader::new(
        fs::File::open(wad_path).expect("the wad opens"),
    ))
    .expect("the wad mounts");
    let mut read = |path: &str| -> Option<Vec<u8>> {
        let chunk = *wad.chunks().get(chunk_hash(path).into())?;
        Some(
            wad.load_chunk_decompressed(&chunk)
                .expect("the chunk reads")
                .into_vec(),
        )
    };

    let mut pairs: Vec<(String, String)> = Vec::new();
    let mut translated = 0usize;
    let mut failed = 0usize;
    let mut millis = Vec::new();

    for object_path in object_paths {
        let shader_dir =
            Path::new(out_dir).join(object_path.rsplit('/').next().unwrap_or(object_path));
        fs::create_dir_all(&shader_dir).expect("the shader dir");
        /* A pixel shader links against a vertex shader whose outputs cover its inputs, as
        D3D pairs them by signature. Each stage's ids with their interface labels. */
        let mut interfaces: [Vec<(u32, BTreeSet<String>)>; 2] = [Vec::new(), Vec::new()];

        for (slot, stage) in [Stage::Vertex, Stage::Pixel].into_iter().enumerate() {
            let name = stage.abbreviation();
            let toc_path = toc_path(object_path, stage);
            let Some(toc_bytes) = read(&toc_path) else {
                eprintln!("{object_path} {name}: no TOC chunk {toc_path}");
                continue;
            };
            let toc = read_toc(&toc_bytes).expect("a TOC");
            let ids: BTreeSet<u32> = toc.shader_ids.iter().copied().collect();
            let mut bundle_id = None;
            let mut bundle = Vec::new();
            for id in ids {
                let wanted = bundle_path(&toc_path, id);
                if bundle_id.as_ref() != Some(&wanted) {
                    bundle = read(&wanted).unwrap_or_else(|| panic!("no bundle {wanted}"));
                    bundle_id = Some(wanted);
                }
                let blob = record(&bundle, index_in_bundle(id)).expect("a record");
                let reflection = reflect(blob).expect("reflection");
                let labels: BTreeSet<String> = match stage {
                    Stage::Vertex => &reflection.outputs,
                    Stage::Pixel => &reflection.inputs,
                }
                .iter()
                .filter(|entry| entry.system_value == 0)
                .map(|entry| entry.label())
                .collect();
                let started = Instant::now();
                match translate(blob, stage) {
                    Ok(out) => {
                        millis.push(started.elapsed().as_secs_f64() * 1000.0);
                        translated += 1;
                        fs::write(shader_dir.join(format!("{id}.{name}.glsl")), &out.glsl)
                            .expect("write glsl");
                        interfaces[slot].push((id, labels));
                    }
                    Err(error) => {
                        failed += 1;
                        eprintln!("{object_path} {name} {id}: {error}");
                    }
                }
            }
        }

        let at = |id: u32, name: &str| {
            shader_dir
                .join(format!("{id}.{name}.glsl"))
                .to_string_lossy()
                .replace('\\', "/")
        };
        let (vertex, pixel) = (&interfaces[0], &interfaces[1]);
        for (ps, inputs) in pixel {
            let Some((vs, _)) = vertex.iter().find(|(_, outputs)| inputs.is_subset(outputs)) else {
                eprintln!("{object_path} ps {ps}: no vertex shader writes {inputs:?}");
                continue;
            };
            pairs.push((at(*vs, "vs"), at(*ps, "ps")));
        }
        for (vs, outputs) in vertex {
            if let Some((ps, _)) = pixel.iter().find(|(_, inputs)| inputs.is_subset(outputs)) {
                pairs.push((at(*vs, "vs"), at(*ps, "ps")));
            }
        }
    }

    millis.sort_by(|a, b| a.partial_cmp(b).expect("no NaN"));
    let percentile = |p: f64| {
        millis.get(((millis.len() as f64 * p) as usize).min(millis.len().saturating_sub(1)))
    };
    eprintln!(
        "translated {translated}, failed {failed}, {} pairs; median {:.1} ms, p95 {:.1} ms, max {:.1} ms",
        pairs.len(),
        percentile(0.5).copied().unwrap_or(0.0),
        percentile(0.95).copied().unwrap_or(0.0),
        millis.last().copied().unwrap_or(0.0)
    );
    fs::write(
        Path::new(out_dir).join("pairs.json"),
        serde_json::to_string(&pairs).expect("json"),
    )
    .expect("write pairs");
}

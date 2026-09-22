//! Compiles the vendored dxbc-spirv sources and the shim into one static library.
//!
//! The source list mirrors `sm5_files`, `spv_files` and `dxbc_spv_files` of the vendored
//! `meson.build`. SM 3 is left out: the game ships SM 5.0 only.

use std::path::Path;

const VENDOR: &str = "vendor/dxbc-spirv";

const SOURCES: &[&str] = &[
    "dxbc/dxbc_api.cpp",
    "dxbc/dxbc_container.cpp",
    "dxbc/dxbc_converter.cpp",
    "dxbc/dxbc_disasm.cpp",
    "dxbc/dxbc_interface.cpp",
    "dxbc/dxbc_io_map.cpp",
    "dxbc/dxbc_parser.cpp",
    "dxbc/dxbc_registers.cpp",
    "dxbc/dxbc_resources.cpp",
    "dxbc/dxbc_signature.cpp",
    "dxbc/dxbc_types.cpp",
    "spirv/spirv_builder.cpp",
    "spirv/spirv_mapping.cpp",
    "ir/ir.cpp",
    "ir/ir_builder.cpp",
    "ir/ir_disasm.cpp",
    "ir/ir_divergence.cpp",
    "ir/ir_dominance.cpp",
    "ir/ir_legalize.cpp",
    "ir/ir_serialize.cpp",
    "ir/ir_utils.cpp",
    "ir/passes/ir_pass_arithmetic.cpp",
    "ir/passes/ir_pass_buffer_kind.cpp",
    "ir/passes/ir_pass_cfg_cleanup.cpp",
    "ir/passes/ir_pass_cfg_convert.cpp",
    "ir/passes/ir_pass_cse.cpp",
    "ir/passes/ir_pass_derivative.cpp",
    "ir/passes/ir_pass_descriptor_indexing.cpp",
    "ir/passes/ir_pass_function.cpp",
    "ir/passes/ir_pass_lower_consume.cpp",
    "ir/passes/ir_pass_lower_io.cpp",
    "ir/passes/ir_pass_lower_min16.cpp",
    "ir/passes/ir_pass_propagate_resource_types.cpp",
    "ir/passes/ir_pass_propagate_types.cpp",
    "ir/passes/ir_pass_remove_unused.cpp",
    "ir/passes/ir_pass_scalarize.cpp",
    "ir/passes/ir_pass_scratch.cpp",
    "ir/passes/ir_pass_ssa.cpp",
    "ir/passes/ir_pass_sync.cpp",
    "util/util_float16.cpp",
    "util/util_log.cpp",
    "util/util_md5.cpp",
    "util/util_swizzle.cpp",
];

fn main() {
    let vendor = Path::new(VENDOR);
    let submodule_checked_out = vendor.join("meson.build").exists()
        && vendor
            .join("submodules/spirv_headers/include/spirv/unified1/spirv.hpp")
            .exists();
    assert!(
        submodule_checked_out,
        "{VENDOR} is empty: run `git submodule update --init --recursive`"
    );

    let mut build = cc::Build::new();
    build
        .cpp(true)
        .std("c++17")
        .include(vendor)
        .include(vendor.join("submodules/spirv_headers/include"))
        .define("DXBC_SPV_ENABLE_SM5", None)
        .define("DXBC_SPV_ENABLE_SPIRV", None)
        .define("NDEBUG", None)
        .warnings(false)
        .file("shim.cpp");
    for source in SOURCES {
        build.file(vendor.join(source));
    }
    build.compile("dxbc_spv");

    println!("cargo:rerun-if-changed=shim.cpp");
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed={VENDOR}/meson.build");
}

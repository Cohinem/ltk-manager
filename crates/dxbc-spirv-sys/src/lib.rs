//! DXBC to SPIR-V through the vendored dxbc-spirv, DXVK's SM 5 compiler.
//!
//! The lowering options are fixed in `shim.cpp` to what a GLSL ES 3.00 backend needs. The
//! output is a SPIR-V module addressed as `PhysicalStorageBuffer64`, with the decorations a
//! Vulkan target reads, so a GL consumer patches it before handing it to SPIRV-Cross.

use std::ffi::{CStr, c_char, c_void};
use std::fmt;
use std::ptr;

unsafe extern "C" {
    fn dxbc_spv_lol_compile(
        data: *const c_void,
        size: usize,
        out_words: *mut *mut u32,
        out_count: *mut usize,
        out_error: *mut *mut c_char,
    ) -> i32;

    fn dxbc_spv_lol_free(pointer: *mut c_void);
}

/// Why a blob did not convert, in dxbc-spirv's own words.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompileError(String);

impl fmt::Display for CompileError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for CompileError {}

/// The SPIR-V words for one DXBC container.
///
/// # Errors
///
/// Fails when `dxbc` is not a DXBC container, or when dxbc-spirv cannot convert its
/// `SHEX` chunk.
pub fn compile(dxbc: &[u8]) -> Result<Vec<u32>, CompileError> {
    let mut words: *mut u32 = ptr::null_mut();
    let mut count: usize = 0;
    let mut error: *mut c_char = ptr::null_mut();

    // SAFETY: the shim reads `dxbc` for the duration of the call only, and writes the three
    // out pointers before returning. The buffers it hands back are malloc'd and owned here
    // until `dxbc_spv_lol_free`.
    let status = unsafe {
        dxbc_spv_lol_compile(
            dxbc.as_ptr().cast(),
            dxbc.len(),
            &mut words,
            &mut count,
            &mut error,
        )
    };

    if status != 0 {
        let message = if error.is_null() {
            "dxbc-spirv failed without a message".to_owned()
        } else {
            // SAFETY: a non-null `error` is a NUL-terminated string the shim malloc'd.
            let text = unsafe { CStr::from_ptr(error) }
                .to_string_lossy()
                .into_owned();
            // SAFETY: freed once, here, and never read again.
            unsafe { dxbc_spv_lol_free(error.cast()) };
            text
        };
        return Err(CompileError(message));
    }

    // SAFETY: on success the shim wrote `count` words at `words`.
    let module = unsafe { std::slice::from_raw_parts(words, count) }.to_vec();
    // SAFETY: the words were copied out, and the buffer is freed once.
    unsafe { dxbc_spv_lol_free(words.cast()) };
    Ok(module)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bytes_that_are_no_container_are_refused_with_a_message() {
        let error = compile(b"not a shader").unwrap_err();
        assert_eq!(error.to_string(), "not a DXBC container");
    }

    #[test]
    fn an_empty_slice_is_refused() {
        assert!(compile(&[]).is_err());
    }
}

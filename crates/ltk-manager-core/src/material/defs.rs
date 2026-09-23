//! The shader defs a program read resolves against, parsed once per version of the file.

use std::collections::HashMap;
use std::sync::Arc;

use parking_lot::Mutex;

use crate::bin_document::{BinDocument, BinDocumentError};
use crate::preview::AssetRef;

/// The `shaders.bin` last parsed out of each asset, parsed again only when its bytes change.
///
/// A program read runs for every material a preview, a grid tile or an inspector table draws,
/// and parsing the defs is the most expensive part of one that the translation cache answers.
#[derive(Debug, Default)]
pub struct ShaderDefsCache {
    parsed: Mutex<HashMap<AssetRef, Arc<BinDocument>>>,
}

impl ShaderDefsCache {
    /// The defs `bytes` parse to, parsed only where `asset` last held other bytes.
    ///
    /// The lock is held across a parse, so reads that miss together parse once.
    ///
    /// # Errors
    ///
    /// Fails with [`BinDocumentError::Unreadable`] where `bytes` are not a bin.
    pub fn defs(
        &self,
        asset: &AssetRef,
        bytes: Vec<u8>,
    ) -> Result<Arc<BinDocument>, BinDocumentError> {
        let mut parsed = self.parsed.lock();
        if let Some(defs) = parsed.get(asset)
            && defs.base() == bytes.as_slice()
        {
            return Ok(Arc::clone(defs));
        }

        let defs = Arc::new(BinDocument::parse(bytes)?);
        parsed.insert(asset.clone(), Arc::clone(&defs));
        Ok(defs)
    }
}

#[cfg(test)]
mod tests;

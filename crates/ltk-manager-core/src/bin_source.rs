//! A bin opened by its magic: a `PROP` mounted as a stream, or a `PTCH` parsed whole.

use std::io::{Read, Seek, SeekFrom};

use ltk_hash::BinHash;
use ltk_meta::BinOverride;
use ltk_meta::stream::BinStream;

/// The magic a `PTCH` opens with, which the streaming reader refuses.
const PATCH_MAGIC: [u8; 4] = *b"PTCH";

/// A bin opened by its kind.
pub enum BinSource<R: Read + Seek> {
    /// A `PROP`, mounted. One object's bytes in memory at a time.
    Stream(BinStream<R>),
    /// A `PTCH`, parsed whole.
    Patch(BinOverride),
}

impl<R: Read + Seek> BinSource<R> {
    /// Open `source` by its magic.
    ///
    /// # Errors
    ///
    /// Fails when `source` cannot be read or is not a bin the toolkit reads.
    pub fn open(mut source: R) -> Result<Self, ltk_meta::Error> {
        let mut magic = [0u8; 4];
        source.read_exact(&mut magic)?;
        source.seek(SeekFrom::Start(0))?;

        if magic == PATCH_MAGIC {
            return Ok(Self::Patch(BinOverride::from_reader(&mut source)?));
        }
        Ok(Self::Stream(BinStream::mount(source)?))
    }
}

/// One object a bin declares, and the class it declares it as.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Declaration {
    pub object: BinHash,
    pub class: BinHash,
}

/// Visit every object the bin in `source` declares, in file order, by its magic.
///
/// A `PROP` is swept through the object table, one 8-byte hop an object. A
/// `PTCH` is read whole, which is the fallback the problems pass carries too
/// while the streaming form of a patch waits upstream, and its patch records
/// declare nothing.
///
/// # Errors
///
/// Fails when `source` cannot be read or is not a bin the toolkit reads.
/// Objects before the failure were visited.
pub fn for_each_declaration<R: Read + Seek>(
    source: R,
    mut visit: impl FnMut(Declaration),
) -> Result<(), ltk_meta::Error> {
    let mut stream = match BinSource::open(source)? {
        BinSource::Patch(patch) => {
            for object in patch.objects.values() {
                visit(Declaration {
                    object: object.path_hash,
                    class: object.class_hash,
                });
            }
            return Ok(());
        }
        BinSource::Stream(stream) => stream,
    };
    for entry in stream.entries() {
        let entry = entry?;
        visit(Declaration {
            object: entry.path_hash,
            class: entry.class_hash,
        });
    }
    Ok(())
}

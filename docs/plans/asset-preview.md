# Asset Preview — Implementation Plan

> Status: **implemented** (2026-08-19), through phase 6. Deviations from the letter of the plan:
> the file-kind dispatch reads the **name first** and the magic bytes second, because
> `LeagueFileKind::Tga` is a three-byte heuristic that a test caught misrouting a broken `.dds`
> (section 3 carries the reasoning). `AssetInfo` grew an `Image` variant so a passed-through PNG
> reports its size the same way a texture does. The zoom and alpha controls sit in the tab row
> through `DocumentActions` rather than in the status strip, per the document-chrome rule in the UX
> document, and the strip below the image carries facts alone. `useOpenDocumentTab` is the pair of
> `openPreview` and `openDocument` that a row actually wires up, so the promotion rule is written
> once. The texture decode is wrapped in `catch_unwind`, because `Tex::decode_mipmap` slices by the
> dimensions its header claims and a truncated file panicked inside the crate.
> Design source: `docs/ux/PROJECT_EDITOR.md` — [Preview tabs](../ux/PROJECT_EDITOR.md#preview-tabs),
> [Where a preview opens](../ux/PROJECT_EDITOR.md#where-a-preview-opens),
> [Preview](../ux/PROJECT_EDITOR.md#preview) under the game browser,
> [Planned document types](../ux/PROJECT_EDITOR.md#planned-document-types).
> Feature rows this closes: **Preview tabs**, **Image preview**. It opens the seam that
> **Bin preview**, **Mesh preview** and **Texture facts** land on later.
>
> Superseded in one place by the follow-up pass on the same day: a **single click no longer
> opens anything**. A double click or the row's **Open** item does, into a tab of its own by
> default, and the replaceable tab this plan describes is now the `replace` setting rather
> than the only behaviour. `useOpenDocumentTab` reads that setting instead of taking a
> gesture, and a preview opens into one group of its own beside whoever asked for it rather
> than into the requesting strip. Chunk reads go through a `WadCache`, a four-entry LRU over
> mounted archives, since several open previews out of one archive would otherwise re-read
> its chunk table each time. `docs/ux/PROJECT_EDITOR.md` carries the current behaviour.

A click on a file row opens nothing today. Both trees are read-only lists of names and sizes, and a
modder who wants to see a texture leaves the application. This plan gives a file row a viewer.

Scope is one viewer: **an image, from a `.tex` or a `.dds`**. Everything else about the design is
the seam the later viewers plug into, because a preview that only knows textures is a preview that
gets rewritten when the second file type arrives.

## 1. Current state (verified 2026-08-19)

| Piece            | Where                                                | Shape today                                                                      |
| ---------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| Layer files      | `<project>/content/<layer>/<relative path>`          | Loose files on disk. `ContentEntry` carries path, size and kind                  |
| Game chunks      | `crates/ltk-manager-core/src/game_wads.rs`           | `GameArchives::read` lists chunks. Nothing reads a chunk's **bytes**             |
| Game index       | `crates/ltk-manager-core/src/game_index.rs`          | Folds every archive into one tree, and **drops which archive a chunk came from** |
| Layer tree rows  | `src/modules/workshop/components/ContentTreeRow.tsx` | A file row's click only moves the roving focus                                   |
| Game tree rows   | `src/modules/workshop/gameBrowser/SourceTreeRow.tsx` | The same                                                                         |
| Documents        | `src/modules/workshop/documents/contentDocument.ts`  | Six kinds, none of them a file                                                   |
| Editor store     | `src/stores/workshopEditor.ts`                       | Every tab is permanent. No notion of a preview tab                               |
| Persisted editor | `src/modules/workshop/state/editorFile.ts`           | `.ltk/editor.json`, version 1, with a zod case per document kind                 |
| Tab strip        | `src/modules/editor/components/EditorTabs.tsx`       | `EditorTab` has `title`, `context`, `icon`, `dirty`                              |
| Image URLs       | `src/modules/workshop/api/useProjectThumbnail.ts`    | `convertFileSrc` over the built-in `asset:` protocol, for files on disk          |
| CSP              | `src-tauri/tauri.conf.json`                          | `img-src 'self' asset: data: http://asset.localhost`                             |
| Custom protocols | —                                                    | None registered. `tauri` is 2.11.5, so the async API is there                    |

Facts that shape the plan:

- A layer file is already a plain file, so the `asset:` protocol could show one with no backend at
  all. A game chunk cannot, and a `.tex` cannot, so a route that only serves layer files is a route
  that gets replaced twice
- `LeagueFileKind::identify_from_bytes` reads the magic bytes, which is the only dispatcher that
  works for a chunk whose path no hash table names
- `ltk_texture` handles both containers behind one `Texture` enum, and mipmap 0 is the full
  resolution level in both. "The largest mip" is level 0 and needs no search
- The game index has no archive attribution, so a preview started from the root browser cannot say
  which archive to read. Section 5 fixes that

## 2. How the pixels reach the UI

This is the one decision the rest of the plan hangs off. Three routes exist.

| Route                   | Cost for a 1024² texture                      | What the UI does                                     |
| ----------------------- | --------------------------------------------- | ---------------------------------------------------- |
| Base64 in an IPC result | 4 MB raw becomes a 5.6 MB JSON **string**     | Decode, then build an `ImageData` and paint a canvas |
| Raw bytes over IPC      | 4 MB `ArrayBuffer`, no encoding overhead      | The same, plus a second call for the dimensions      |
| **A custom URI scheme** | ~0.6 MB of PNG, and none of it on the JS heap | `<img src={url}>`                                    |

**The custom scheme wins, and it is not close.** The first two hand the raw surface to JavaScript,
which then reassembles an image the webview already knows how to decode. The third asks the backend
for an image and lets the webview do what it is for. It also gets zoom, pan, `object-fit` and the
browser's own decoder for free, and the bytes never enter the JS heap.

So: register `ltk-asset`, and respond with a PNG.

**PNG rather than a raw surface**, because the alternative that avoids re-encoding is a BMP, whose
alpha channel needs a `BITMAPV5HEADER` and reads as a bug the first time someone opens it in another
tool. Encode with `CompressionType::Fast` and `FilterType::NoFilter`, which is close to a memcpy and
still a PNG every decoder accepts. Leave `Best` alone, because nothing here is stored.

### The URL

```
ltk-asset://localhost/<token>        (macOS, Linux)
http://ltk-asset.localhost/<token>   (Windows)
```

`convertFileSrc(token, "ltk-asset")` from `@tauri-apps/api/core` writes the right one per platform,
which is the same helper the thumbnails already use.

`<token>` is the base64url of the JSON `AssetRef`, **unpadded**. Unpadded base64url is `A-Za-z0-9-_`
alone, which `encodeURIComponent` passes through untouched, so the handler reads `uri.path()[1..]`
and decodes with no percent-decoding step in between. A query string would have to be assembled by
hand per platform, and a raw path would put a Windows path, a `?` and a `#` into a URL and invite
the escaping bug that comes with them.

The ref is `ts-rs`-exported, so the frontend builds the object against a generated type rather than
against a string format.

### CSP

`img-src` gains `ltk-asset: http://ltk-asset.localhost`.

### Caching

Every response carries `Cache-Control: no-store`. A layer file changes under the viewer whenever a
modder replaces it, and a stale image is a worse failure than a second decode. Section 11 has the
cache that buys the decode back if it ever matters.

## 3. The backend seam

Two concerns, kept apart, because they vary independently. Where the bytes come from is one
question. What to draw with them is another.

```
crates/ltk-manager-core/src/preview/
├─ mod.rs       AssetRef, Preview, PreviewError
├─ source.rs    AssetRef::read — the byte sources
└─ texture.rs   the ltk_texture path
```

### Where the bytes come from

```rust
/// Where a previewed asset's bytes come from.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AssetRef {
    /// A file of one layer of a workshop project.
    Layer { project: String, layer: String, path: String },
    /// One chunk of one archive of the installed game.
    GameChunk { wad: String, path_hash: String },
    /// Any file on disk, for a preview that belongs to no project.
    File { path: String },
}

impl AssetRef {
    /// Read the asset's bytes from wherever it lives.
    pub fn read(&self, config: &Config) -> AppResult<Vec<u8>>;

    /// The name a viewer shows, and what a kind guess falls back to.
    pub fn name(&self) -> &str;
}
```

`File` is not speculative. It is what a drag onto the window, an import candidate and a mod package
entry each need, and it costs one match arm.

`Layer` and `File` both resolve to a path, and both go through the containment check that
`GameArchives::archive_path` already applies: reject anything with a non-`Normal` component,
canonicalize, and confirm the result is still under the root. A ref arrives from the webview, so it
is untrusted input, and `../../../` in a layer path must not read the user's home directory.

`GameChunk` mounts the named archive, finds the chunk by hash and calls
`Wad::load_chunk_decompressed`. `GameArchives` gains a `read_chunk(&self, wad_name, path_hash)`
method for it, which reuses `archive_path` and so inherits the same check.

### What to draw with them

```rust
/// A decoded preview of one asset, ready for a webview to draw.
#[derive(Debug)]
pub enum Preview {
    Image(PreviewImage),
}

/// A preview the webview draws as an image.
#[derive(Debug)]
pub struct PreviewImage {
    pub bytes: Vec<u8>,
    pub mime: &'static str,
    pub width: u32,
    pub height: u32,
}

impl AssetRef {
    /// Read the asset and render whatever its file kind has a viewer for.
    ///
    /// # Errors
    ///
    /// Fails when the asset cannot be read, and with
    /// [`PreviewError::Unsupported`] when no viewer handles its kind.
    pub fn preview(&self, config: &Config) -> AppResult<Preview>;
}
```

`preview` dispatches on `LeagueFileKind::identify_from_bytes`, and falls back to the extension of
`name()` when the magic bytes say `Unknown`. Magic first, because a chunk under an `unknown`
directory has a hash for a name and no extension at all.

| Kind                    | v1 route                                                   |
| ----------------------- | ---------------------------------------------------------- |
| `Texture`, `TextureDds` | `ltk_texture` to RGBA, then a PNG                          |
| `Png`, `Jpeg`           | Straight through, with the matching MIME. No decode at all |
| Everything else         | `PreviewError::Unsupported`, which the UI reads as a state |

A later viewer is a variant on `Preview` and an arm in that match. Nothing above it changes.

### The texture path

```rust
let texture = Texture::from_reader(&mut Cursor::new(bytes))?;
let image = texture.decode_mipmap(0)?.into_rgba_image()?;
```

Level 0 is the full resolution level in both containers, so "the largest mip" needs no search.
`TexSurface::into_rgba_image` does the BGRA swizzle, and the DDS surface arrives as RGBA already.

The dependency is `ltk_texture = "0.4.4"`, declared in `[workspace.dependencies]` and taken by
`ltk-manager-core` alone. Not the `league-toolkit` facade, which would pull the mesh, animation and
bin crates in for a texture decode. Not the `intel-tex` feature, which is for encoding.

Encode with `PngEncoder::new_with_quality(w, CompressionType::Fast, FilterType::NoFilter)`.

## 4. The two front doors

### The protocol

Registered in `main.rs` beside the plugins, handled in a new `src-tauri/src/protocol.rs`.

```rust
builder.register_asynchronous_uri_scheme_protocol("ltk-asset", |ctx, request, responder| {
    let app = ctx.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || responder.respond(serve(&app, &request)));
});
```

`spawn_blocking`, because a decode is tens of milliseconds and the handler runs on the main thread.

| Outcome                   | Status | Body                     |
| ------------------------- | ------ | ------------------------ |
| Rendered                  | 200    | The image, with its MIME |
| The token is not a ref    | 400    | The message              |
| The asset is not there    | 404    | The message              |
| No viewer for that kind   | 415    | The message              |
| A read or a decode failed | 500    | The message              |

415 is the one the UI reads by hand, so the message stays plain text and the status carries the
meaning.

### The metadata command

An `<img>` reports its pixel dimensions and nothing else. The format, the mip count and the
container are what a modder actually asks a texture, and they are what the **Texture facts** row of
the inspector wants, so they come over IPC.

```rust
/// Report what a previewable asset holds, without decoding it.
#[tauri::command]
pub async fn read_asset_info(asset: AssetRef, app_handle: AppHandle) -> IpcResult<AssetInfo>;
```

```rust
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AssetInfo {
    Texture(TextureInfo),
    Unsupported { file_kind: WorkshopFileKind },
}

pub struct TextureInfo {
    pub width: u32,
    pub height: u32,
    /// `TEX` or `DDS`.
    pub container: String,
    /// The block format, where the container names one. `Bc3`, `Bgra8`.
    pub format: Option<String>,
    pub mip_count: u32,
    pub size_bytes: u64,
}
```

This reads the header and skips the decode, so it costs a chunk read. Two reads for one preview is
the honest cost of the split, and a chunk is tens of kilobytes.

`format` is an `Option` because `ltk_texture::Dds` exposes no format accessor. `width` and `height`
come from `Tex` directly and from the **decoded surface** for a DDS, because `Dds::height()` returns
the width. Section 11 has the upstream note.

## 5. The game index learns its archives

A `GameIndex` file keeps a name, a hash and a size. A preview needs the archive too, and the index
is the only thing that ever knew it.

- `GameIndex` keeps a `Vec<String>` of archive names, in the order it merged them
- Its `File` gains a `wad: u32` ordinal into that vector, which is 3.3 MB over the 819,136 files of
  a live install
- `GameFileEntry` gains `wad: String`, resolved when a listing is built

A listing is one directory, so the repeated names cost nothing on the wire. The scoped browser
already knows its archive from its own tab, and this is what gives the root browser the same.

The field pays a second time. **In the game archive** in the asset inspector is the field the UX
document calls the highest-value one overall, and it needs exactly this.

## 6. Preview tabs

The UX rules, unchanged from the document:

- A single click in a tree opens the file in a preview tab
- The next single click replaces the content of that same tab
- A double click keeps the tab
- A preview tab shows its name in italic
- The strip holds one preview tab at a time, across every leaf

### Store

`ProjectEditor` gains one field.

```ts
/** The one ephemeral tab, replaced by the next single click. Null when none. */
previewId: string | null;
```

Three actions, and one edit to a fourth.

| Action                                 | Behaviour                                                                  |
| -------------------------------------- | -------------------------------------------------------------------------- |
| `openPreview(path, document, leafId?)` | Replaces the current preview **in place**, or inserts a tab and records it |
| `promoteDocument(path, id)`            | Clears `previewId` when it matches, which is what a double click calls     |
| `closeDocument(path, leafId, id)`      | Clears `previewId` when it closes the preview                              |

In place matters. A replacement that removes and re-inserts moves the tab to the end of the strip
and makes the row jump under the pointer between two clicks. The layout module gains one op:

```ts
export function replaceTab(
  tree: LayoutNode,
  leafId: string,
  fromId: string,
  toId: string,
): LayoutNode;
```

A preview that is already open is a plain activate, so clicking one row twice does not churn the
tree.

`openDocument` on a document that is currently the preview promotes it. That is what makes "open it
properly" work from a context menu without a second gesture.

### Persistence

`previewId` joins `PersistedProjectEditor`, and `sanitizeEditorState` defaults it to null when it is
absent or names a document the file does not hold.

**The file version stays at 1.** The field is additive, and an older build reading a version 2 file
would treat it as `newer` and refuse to write the file at all — which turns an optional field into a
lockout. `parseEditorFile` already tolerates unknown keys and a missing one.

`contentDocumentSchema` gains the `preview` case, or a persisted preview tab drops on the next open.

### Strip

`EditorTab` gains `preview?: boolean`, which `EditorSurface` fills from a new `previewId` prop the
way it fills `dirty` from `dirtyIds`. The tab title renders `italic`.

## 7. The preview document

```ts
interface PreviewDoc extends EditorDocumentBase {
  kind: "preview";
  asset: AssetRef;
  /** The basename, or the hash in hex when no hash table names the chunk. */
  title: string;
  /** Where the asset came from, for the tab's dim context field. */
  context: string;
}
```

The id is `preview:` plus a stable key per ref — `layer:<layer>:<path>`, `game:<wad>:<hash>`,
`file:<path>`. Two requests for one asset then land on one tab, which is the rule the scoped browser
already obeys.

Registry entry: the icon is the shared `describeFileKind` glyph for the asset's kind, so a preview
tab reads like the tree row it came from. The label is `{ title, context }`.

### The viewer

`ImagePreview`, under `src/modules/workshop/preview/`.

```
┌──────────────────────────────────────────────┐
│                                              │
│              ▚▚▚▚▚▚▚▚▚▚▚▚                    │
│              ▚  the image ▚                  │  checkerboard ground
│              ▚▚▚▚▚▚▚▚▚▚▚▚                    │
│                                              │
├──────────────────────────────────────────────┤
│ 1024 × 1024   TEX · Bc3   9 mips   341 KB  ⊟ │  status strip
└──────────────────────────────────────────────┘
```

| Piece        | Treatment                                                                    |
| ------------ | ---------------------------------------------------------------------------- |
| Ground       | `bg-surface-950`, with a checkerboard drawn from two `surface-800` squares   |
| The image    | `object-contain`, and `image-rendering: pixelated` past 100%                 |
| Status strip | `h-8`, `bg-surface-900`, `font-mono text-xs text-surface-400`, `select-text` |
| Zoom         | Fit and 1:1, plus `Ctrl` and the wheel. The control sits in the strip        |
| Alpha        | A toggle that drops the checkerboard for a flat ground                       |
| Loading      | The shared `Spinner`, centred                                                |
| Unsupported  | An `EmptyState` naming the kind, and the route to open the file externally   |

The checkerboard is the one piece here that earns its complexity. A texture with alpha on a flat
dark ground is indistinguishable from a texture that is dark, and skin work is mostly alpha.

`useAssetInfo(asset)` is a TanStack Query over `read_asset_info`, keyed by the asset ref. The `<img>`
takes the protocol URL directly, so its loading state is `onLoad` and `onError` rather than a query.
Those are two independent requests, and the strip shows what it has.

## 8. Wiring the trees

Both trees gain the same prop, and neither learns what a preview is.

| Tree                   | Change                                                                   |
| ---------------------- | ------------------------------------------------------------------------ |
| `ContentTree` / `…Row` | `onOpen(entry, { preview })` on a file row. Click previews, double keeps |
| `SourceTree` / `…Row`  | The same, over a `SourceEntry` plus the archive name                     |

A row keeps its `onSelect` for the roving focus. `onClick` fires both, and `onDoubleClick` promotes —
the browser fires `click` twice before `dblclick`, so the second click lands on a tab that is already
the preview and the promote follows it. That ordering is why `openPreview` on the open preview is an
activate rather than a replace.

`Enter` on the focused row opens it too, through `useSourceTreeNav` and `useContentTreeNav`.

The call sites build the ref:

```ts
// A layer file
openPreview(
  previewDocument({ kind: "layer", project, layer: layerName, path: entry.relativePath }),
);

// A game chunk
openPreview(previewDocument({ kind: "gameChunk", wad: entry.wad, pathHash: entry.pathHash }));
```

## 9. Phases

Each phase is a reviewable commit, and each leaves the application working.

**1. The byte sources.** `preview/source.rs` with `AssetRef` and `read`, `GameArchives::read_chunk`,
the containment tests. No viewer, no IPC.

**2. The archive ordinal.** `GameIndex` keeps its archive names, and `GameFileEntry` reports `wad`.
The game browser needs no change to keep working, and the field is what phase 5 reads.

**3. The texture viewer.** `ltk_texture` in the workspace, `preview/texture.rs`, `AssetRef::preview`
and its dispatch. Tested against one `.tex` and one `.dds` under
`crates/ltk-manager-core/tests/fixtures/`, which the `ltk-tex-utils` repository's `assets/` can
supply.

**4. The front doors.** The `ltk-asset` protocol, the CSP entry, `read_asset_info`. Verified with a
URL pasted into a devtools address bar before any UI exists.

**5. The preview document.** The document kind, the registry entry, `ImagePreview`, the query. Wired
to one tree only, opening a permanent tab. The viewer is reviewable at this point.

**6. Preview tabs.** `previewId`, `replaceTab`, `openPreview`, `promoteDocument`, the italic title,
the persistence field and the schema case. Both trees wired.

## 10. Tests

| Level     | Covers                                                                          |
| --------- | ------------------------------------------------------------------------------- |
| Rust unit | Every `AssetRef` variant rejects a path that escapes its root                   |
| Rust unit | A `.tex` and a `.dds` fixture decode to the dimensions their headers claim      |
| Rust unit | An unsupported kind reports `Unsupported` rather than an I/O error              |
| Rust unit | The token round-trips: `AssetRef` to base64url and back                         |
| TS unit   | `replaceTab` keeps the strip index, and leaves an untouched leaf's identity     |
| TS unit   | The store's preview rules: replace, promote, close, and open-the-same-one       |
| TS unit   | `parseEditorFile` on a version 1 file with no `previewId`, and with a stale one |

`cargo fmt`, `cargo clippy --all-targets` and `cargo doc --no-deps` come back clean.
`pnpm generate:types` regenerates the bindings after phases 1, 2 and 4.

## 11. Follow-ups, and what this plan leaves out

**`Dds::height()` returns the width.** `ltk_texture` 0.4.4, `src/dds.rs`. The plan reads DDS
dimensions off the decoded surface to route around it. Report it upstream, because every other
consumer of that crate has the same bug.

**No format for a DDS.** `ltk_texture::Dds` keeps its `ddsfile::Dds` private and exposes no format
accessor, so `TextureInfo::format` is `None` for that container. An upstream accessor closes it.

**A 4096² atlas decodes to 64 MB of RGBA.** The plan decodes mip 0 always, because that is what the
UX document asks for and correctness comes first. If it reads slow, the answer is a `max` query
parameter that picks the largest mip under a cap, and not a change to the default.

**Every preview remounts its archive.** A modder clicking through fifty textures of one archive
mounts it fifty times. Chunk tables are small and this is milliseconds, so it stays out of v1. The
answer, if it is ever needed, is a `Mutex<LruCache<String, Wad<BufReader<File>>>>` of four entries in
the app state.

**A viewer for a `.bin` and a `.skn`.** Both are a `Preview` variant and a match arm. Neither is in
this plan.

**The asset inspector.** `TextureInfo` is the payload its **Texture facts** row wants, and the row
lands with the inspector rather than here.

## 12. Open questions

1. Does a preview tab survive a restart? The plan persists it, on the grounds that everything else
   in the strip does and a modder who reopens a project expects the same screen. The other reading
   is that an ephemeral tab is ephemeral, and it should be dropped on write.
2. Does a double click on an already-permanent tab do anything? The plan says no.

# `.fig` file binary format reference

Source: agent research May 2026 + first-hand `xxd` of the user's
`design.fig` export (122,805 bytes, exported 2026-05-03 19:26).

## Container

`.fig` is a standard ZIP archive. Use `unzip -l` to list:

```
Length      Date    Time    Name
---------  ---------- -----   ----
   115383  05-03-2026 19:26   canvas.fig
     4556  05-03-2026 19:26   thumbnail.png
      335  05-03-2026 19:26   meta.json
        0  05-03-2026 19:26   images/
     1560  05-03-2026 19:26   images/<sha1-hash>
```

### `meta.json`

Small JSON with file-level metadata. Example:

```json
{
  "client_meta": {
    "background_color": {"r": 0.117, "g": 0.117, "b": 0.117, "a": 1},
    "thumbnail_size": {"width": 400, "height": 242},
    "render_coordinates": {"x": -1711, "y": 634.5, "width": 5420, "height": 3272.47}
  },
  "file_name": "Untitled",
  "developer_related_links": [],
  "exported_at": "2026-05-03T23:26:16.832Z"
}
```

`background_color` is the Figma canvas paint (slate `#1e1e1e` for the
default dark-mode editor), NOT the design's actual outer surface.
Don't read it as a color spec — it's the editor chrome behind frames.

### `thumbnail.png`

400×242 preview. Useful for "did the export include the right frames"
sanity but not for pixel-level comparison.

### `images/`

Bitmap assets referenced by image-fill nodes inside `canvas.fig`. Each
image is named by its sha1 hash. Look up the hash inside the parsed
canvas data to find which node references it.

### `canvas.fig`

The scenegraph. Magic header is the literal ASCII `fig-kiwi`:

```
00000000: 6669 672d 6b69 7769 6a00 0000 3268 0000  fig-kiwij...2h..
```

After the header:
- 4-byte length-prefix (varies by version)
- A schema chunk (deflate-compressed; decompress with `pako`)
- A data chunk (Zstandard-compressed; decompress with `fzstd`)

Both chunks are kiwi-encoded. Decode each with `kiwi-schema` against
the schema chunk.

The scenegraph contains:
- Nodes (frames, instances, text, vectors, etc.)
- Fills (solid, gradient, image)
- Effects (drop shadow, blur, layer-blur)
- Layout (auto-layout, padding, gap, alignment)
- Constraints (left/right/top/bottom/scale/center)
- Text styles (font, size, line-height, letter-spacing)
- Components + variants

## Reference parsers

| Tool | Status | Use |
|---|---|---|
| `fig-kiwi` (npm) | DEAD (last 2023) | Skip |
| `figma-kiwi-protocol` (allan-simon) | Active 2026, ~23★ | Adapt for files-at-rest |
| `evanw/kiwi` | The schema lib itself | Building block |
| `pako` (npm) | Active | Deflate inflate |
| `fzstd` (npm) | Active | Zstd inflate |
| `figma-make-extractor` (Sikkema) | Targets `fig-makee` not `fig-kiwi` | Reference only |

### Minimal own-parser sketch

```js
import { unzipSync } from "fflate";
import * as kiwi from "kiwi-schema";
import { inflate } from "pako";
import { decompress as zstdDecompress } from "fzstd";

const fig = readFileSync("design.fig");
const zip = unzipSync(fig);
const canvas = zip["canvas.fig"];

const body = canvas.subarray(12);

```

This is ~3 hours of work end-to-end. Most of the time spent on
edge-cases in fills and gradients. If you only need colors + layout,
~80 lines covers it.

## When to parse vs use REST

Almost always, **REST API + PAT is the right answer**. `.fig` parsing
makes sense only when:
- The user has no Figma account / no PAT and only an exported `.fig`
- You need offline reproducibility (CI pipeline that runs on a fresh
  runner with no network access)
- You're tracking design state across commits (a `.fig` in `docs/`
  versioned alongside code)

For interactive Claude Code sessions, REST is faster.

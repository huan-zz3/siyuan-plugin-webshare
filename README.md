# Doc Web Share

A SiYuan plugin that shares notes to the public web. It exports the current document as a
self-contained static artifact and can upload it to a self-hosted static server, producing a public
link. Free to use and self-hostable.

[中文版](./README.zh-CN.md)

## Status

- Plugin id: `siyuan-plugin-webshare`
- Display name: Doc Web Share / 文档公网分享
- Version: `0.1.0`
- Author: 幻酌
- Repository: <https://github.com/huan-zz3/siyuan-plugin-webshare>

The project was initialized from the `plugin-sample-vite-svelte` template. It now implements two
milestones: exporting the current document as a static, self-contained HTML artifact, and uploading
that artifact to an independently runnable static server.

## Requirements

- Node.js >= 24 (plugin and server)
- pnpm 11.4
- SiYuan desktop

## Publishing artifact (Milestone A)

Run **Export as publish artifact** (`exportPublishArtifact`) from the command palette while a document
is open. The plugin:

1. calls `/api/export/exportHTML` with `savePath: ""`;
2. receives the rendered body fragment and the kernel export folder;
3. builds a fixed `index.html` around that fragment;
4. writes it next to the kernel-generated assets.

The result is a self-contained static directory at `<workspace>/temp/export/<folder>/` containing
`index.html`, `assets/`, `emojis/`, `stage/`, and `appearance/`. Serve that directory with any static
server and open it in a browser.

The artifact is temporary: the kernel clears `temp/export` on startup and exit, and clears
`temp/export/<boxID>` when an encrypted notebook is locked. Upload it before restarting or locking.

Known limits for this milestone: light theme only; plugin CSS, code snippets, custom fonts, mobile
extras, and bookmark icons are not included; PlantUML uses the configured remote service;
`JetBrainsMono` is referenced by the export CSS but not copied by the kernel.

To verify locally, run the command and use the directory shown in the notification:

```bash
npx serve "<workspace>/temp/export/<folder>"
```

Check images, custom emoji, code highlighting, inline and block math, mermaid, echarts, graphviz,
flowchart, mindmap, and abc. Formula and diagram rendering happens in the visitor's browser through
SiYuan's bundled runtime.

## Publishing to a server (Milestone B)

The plugin can upload the artifact to a small standalone server in `server/`. The server stores bytes
and serves them from `/p/<id>/`; it does not parse, rewrite, sanitize, or render HTML. The visitor's
browser runs SiYuan's bundled export runtime, so formulas and diagrams render exactly as in the local
artifact.

### Start the server

```bash
cd server
cp .env.example .env
# set PUBLISH_TOKEN to a random value of at least 32 characters
pnpm install
pnpm dev
```

See `server/README.md` for configuration, deployment, and security notes. The server must be mounted
at the origin root (`/api/*`, `/p/*`); subpath deployment is not supported in this milestone.

### Configure and publish

Open the plugin settings (SiYuan settings → Plugins → Doc Web Share → Settings) and set:

- **Publish server URL**: origin only, for example `https://publish.example.com`
- **Publish server token**: the server's `PUBLISH_TOKEN`
- **Test connection** verifies the URL and token.

Open a document and run **Publish to server** from the command palette or the top-bar menu. The dialog
shows export, upload progress, and the final URL. Closing the dialog aborts the publish. Each publish
creates a new immutable URL; republishing does not overwrite the previous one.

The publish server token is not the SiYuan API token. The plugin uses the SiYuan token only to read the
local artifact through the kernel.

### Current limits

- No HTML sanitization. Only the token holder can upload, but published pages execute inline scripts on
  the hosting domain; use a dedicated domain without cookies or admin sessions.
- No shared-asset deduplication. Each publication carries its own `stage/` and `appearance/` copy
  (tens of MB per document); `public/` grows linearly.
- No access control, expiry, deletion API, publishing history, or stable URLs.
- The server must stay on the domain root; `/p/<id>` redirects to `/p/<id>/` because the export page
  uses relative asset paths.
- The local artifact is temporary. Publish before restarting SiYuan or locking an encrypted notebook.

### Verification

```bash
pnpm check:all   # plugin types/Svelte + server type check + server tests
pnpm build       # plugin dist/ and package.zip
pnpm server:build
```

The server test suite covers authentication, CORS preflight, create/upload/complete, static serving,
trailing-slash redirects, traversal, manifest mismatches, size limits, and staging cleanup. For an
end-to-end check, upload a real artifact and open the returned URL on another device; verify images,
emoji, code highlighting, math, mermaid, echarts, graphviz, flowchart, mindmap, and abc.

## Development

```bash
pnpm i
pnpm make-link   # link dev/ into <workspace>/data/plugins/siyuan-plugin-webshare
pnpm dev         # watch the frontend and kernel bundles
pnpm server:dev  # watch the standalone publish server
```

Then open SiYuan, enable the plugin in the marketplace, and press `Ctrl+Shift+I` to open DevTools.

Verification:

```bash
pnpm check        # plugin only
pnpm check:all    # plugin + server type check + server tests
pnpm build        # writes dist/ and package.zip
pnpm server:build # compiles the standalone server
```

`pnpm make-install` builds and copies `dist/` into the SiYuan plugin directory instead of linking.

If SiYuan is locked, `make-install` cannot query the workspace list. Unlock SiYuan, or set
`SIYUAN_PLUGIN_DIR` to `<workspace>/data/plugins`.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/index.ts` | Frontend entry (`index.js`) |
| `src/examples/` | Archived template examples (frontend snippets and external capture service; fully commented, not built) |
| `src/kernel.ts` | Kernel entry (`kernel.js`; demo RPC only) |
| `src/publish/` | Artifact export, artifact enumeration, server client, upload orchestration, progress dialog |
| `server/` | Independent Fastify static publishing service (own package, tsconfig, and tests) |
| `src/api.ts` | SiYuan HTTP API wrapper |
| `src/libs/` | Settings, dialog, and form helpers |
| `public/i18n/` | UI translations (`en.json`, `zh-CN.json`) |
| `plugin.json` | SiYuan plugin manifest |
| `reference/` | Local upstream checkouts for API lookup (git-ignored, not built) |
| `AGENTS.md` | Repo-specific notes for AI coding agents |

## Reference sources (optional)

`reference/` holds local, git-ignored checkouts used only for looking up kernel APIs and
implementation details. Nothing inside it is tracked or built.

- `reference/siyuan/` — [siyuan-note/siyuan](https://github.com/siyuan-note/siyuan), full source at a release tag
- `reference/siyuan-plugin-share/` — [b8l8u8e8/siyuan-plugin-share](https://github.com/b8l8u8e8/siyuan-plugin-share), implementation reference

To create or upgrade the SiYuan checkout, delete the directory and take a fresh shallow clone of the
latest stable release:

```powershell
$tag = (Invoke-RestMethod "https://api.github.com/repos/siyuan-note/siyuan/releases/latest").tag_name
Remove-Item -Recurse -Force reference\siyuan -ErrorAction SilentlyContinue
git clone --depth 1 --single-branch --branch $tag --no-tags https://github.com/siyuan-note/siyuan.git reference/siyuan
```

The third-party reference tracks `main`, so it is refreshed the same way:

```powershell
Remove-Item -Recurse -Force reference\siyuan-plugin-share -ErrorAction SilentlyContinue
git clone --depth 1 --single-branch https://github.com/b8l8u8e8/siyuan-plugin-share.git reference/siyuan-plugin-share
```

`reference/` is listed in `.gitignore` and sits outside every `tsconfig` / Vite entry, so
`pnpm check` and `pnpm build` ignore it. CodeGraph indexes it only because `codegraph.json` opts in
via `includeIgnored`; after replacing a checkout, rebuild the index with `codegraph index` (on
Windows, stop the CodeGraph daemon first — it holds `codegraph.db`).

## License

MIT

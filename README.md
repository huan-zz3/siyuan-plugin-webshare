# SiYuan Publisher

A SiYuan plugin for publishing notes. **The plugin is under development.**

[中文版](./README.zh-CN.md)

## Status

- Plugin id: `siyuan-plugin-publisher`
- Display name: SiYuan Publisher / 思源发布器
- Version: `0.1.0`
- Author: TBD
- Repository: TBD

The project was initialized from the `plugin-sample-vite-svelte` template. Feature implementation has
started with the first milestone: exporting the current document as a static, self-contained HTML
artifact.

## Requirements

- Node.js >= 24
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

## Development

```bash
pnpm i
pnpm make-link   # link dev/ into <workspace>/data/plugins/siyuan-plugin-publisher
pnpm dev         # watch the frontend and kernel bundles
```

Then open SiYuan, enable the plugin in the marketplace, and press `Ctrl+Shift+I` to open DevTools.

Verification:

```bash
pnpm check
pnpm build       # writes dist/ and package.zip
```

`pnpm make-install` builds and copies `dist/` into the SiYuan plugin directory instead of linking.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/index.ts` | Frontend entry (`index.js`) |
| `src/kernel.ts` | Kernel entry (`kernel.js`, no DOM / Node built-ins) |
| `src/kernel-capture/` | External capture service example kept from the template |
| `src/publish/` | Static HTML artifact export (`exportHTML` + fixed `index.html` template) |
| `src/api.ts` | SiYuan HTTP API wrapper |
| `src/libs/` | Settings, dialog, and form helpers |
| `public/i18n/` | UI translations (`en.json`, `zh-CN.json`) |
| `plugin.json` | SiYuan plugin manifest |
| `docs/` | Kernel plugin documentation |
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

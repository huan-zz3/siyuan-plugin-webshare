# SiYuan Publisher

A SiYuan plugin for publishing notes. **The plugin is under development.**

[中文版](./README.zh-CN.md)

## Status

- Plugin id: `siyuan-plugin-publisher`
- Display name: SiYuan Publisher / 思源发布器
- Version: `0.1.0`
- Author: TBD
- Repository: TBD

The project was initialized from the `plugin-sample-vite-svelte` template. Feature implementation
has not started yet; the sections below describe how to build and run it.

## Requirements

- Node.js >= 24
- pnpm 11.4
- SiYuan desktop

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

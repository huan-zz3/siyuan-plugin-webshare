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
| `AGENTS.md` | Repo-specific notes for AI coding agents |

## License

MIT

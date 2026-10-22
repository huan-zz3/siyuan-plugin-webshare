# 思源发布器（SiYuan Publisher）

一个用于发布思源笔记的思源插件。**目前仍在开发中。**

[English](./README.md)

## 当前状态

- 插件 id：`siyuan-plugin-publisher`
- 显示名称：思源发布器 / SiYuan Publisher
- 版本：`0.1.0`
- 作者：【待填写】
- 仓库地址：【待填写】

项目基于 `plugin-sample-vite-svelte` 模板初始化，功能尚未开始实现。下面是构建和运行方式。

## 环境要求

- Node.js >= 24
- pnpm 11.4
- 思源桌面端

## 开发

```bash
pnpm i
pnpm make-link   # 把 dev/ 软链到 <工作区>/data/plugins/siyuan-plugin-publisher
pnpm dev         # 同时监听前端和 kernel 两个 bundle
```

然后在思源集市中启用插件，按 `Ctrl+Shift+I` 打开开发者工具。

验证：

```bash
pnpm check
pnpm build       # 生成 dist/ 和 package.zip
```

`pnpm make-install` 会先构建，再把 `dist/` 复制到思源插件目录（不使用软链）。

## 目录结构

| 路径 | 用途 |
| --- | --- |
| `src/index.ts` | 前端入口（生成 `index.js`） |
| `src/kernel.ts` | Kernel 入口（生成 `kernel.js`，无 DOM / Node 内置模块） |
| `src/kernel-capture/` | 模板自带的外部摘录服务示例 |
| `src/api.ts` | 思源 HTTP API 封装 |
| `src/libs/` | 设置、对话框、表单等工具 |
| `public/i18n/` | 界面文案（`en.json`、`zh-CN.json`） |
| `plugin.json` | 思源插件清单 |
| `docs/` | Kernel Plugin 文档 |
| `AGENTS.md` | 给 AI 编码代理的仓库约定 |

## 许可证

MIT

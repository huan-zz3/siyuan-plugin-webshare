# 思源发布器（SiYuan Publisher）

一个用于发布思源笔记的思源插件。**目前仍在开发中。**

[English](./README.md)

## 当前状态

- 插件 id：`siyuan-plugin-publisher`
- 显示名称：思源发布器 / SiYuan Publisher
- 版本：`0.1.0`
- 作者：【待填写】
- 仓库地址：【待填写】

项目基于 `plugin-sample-vite-svelte` 模板初始化。已开始第一个里程碑：把当前文档导出为可静态托管的 HTML 产物。

## 环境要求

- Node.js >= 24
- pnpm 11.4
- 思源桌面端

## 发布产物（里程碑 A）

打开一篇文档后，从命令面板运行 **导出为可发布产物**（`exportPublishArtifact`）。插件会：

1. 以 `savePath: ""` 调用 `/api/export/exportHTML`；
2. 拿到渲染好的正文片段和内核导出目录；
3. 用固定模板拼出 `index.html`；
4. 把它写回内核生成的资源目录。

产物是 `<工作区>/temp/export/<folder>/` 下的自包含静态目录，含 `index.html`、`assets/`、`emojis/`、
`stage/`、`appearance/`。用任意静态服务器指向该目录并在浏览器打开即可。

产物是临时的：内核启动/退出时会清空 `temp/export`；加密笔记本被锁定时会清空 `temp/export/<boxID>`。
请在重启或锁定前完成上传。

本里程碑的已知限制：仅浅色主题；不包含插件 CSS、代码片段、自定义字体、移动端附加样式和书签图标；
PlantUML 依赖所配置的远程服务；导出 CSS 引用了 `JetBrainsMono`，但内核不会拷贝该字体。

本地验证：运行命令后，用通知里给出的目录启动静态服务器：

```bash
npx serve "<工作区>/temp/export/<folder>"
```

检查图片、自定义 emoji、代码高亮、行内/块级公式、mermaid、echarts、graphviz、flowchart、mindmap、abc。
公式和图表的渲染由访客浏览器执行思源自带的运行时完成。

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
| `src/publish/` | 静态 HTML 产物导出（`exportHTML` + 固定 `index.html` 模板） |
| `src/api.ts` | 思源 HTTP API 封装 |
| `src/libs/` | 设置、对话框、表单等工具 |
| `public/i18n/` | 界面文案（`en.json`、`zh-CN.json`） |
| `plugin.json` | 思源插件清单 |
| `docs/` | Kernel Plugin 文档 |
| `reference/` | 本地上游参考代码（被 git 忽略，不参与构建） |
| `AGENTS.md` | 给 AI 编码代理的仓库约定 |

## 参考源码（可选）

`reference/` 存放本地的上游代码，仅用于查阅 Kernel API 和实现细节；整个目录被 git 忽略，也不参与构建。

- `reference/siyuan/` —— [siyuan-note/siyuan](https://github.com/siyuan-note/siyuan)，正式版 tag 的完整源码
- `reference/siyuan-plugin-share/` —— [b8l8u8e8/siyuan-plugin-share](https://github.com/b8l8u8e8/siyuan-plugin-share)，第三方实现参考

需要首次拉取或升级思源本体时，删除目录并重新浅克隆最新的正式版即可：

```powershell
$tag = (Invoke-RestMethod "https://api.github.com/repos/siyuan-note/siyuan/releases/latest").tag_name
Remove-Item -Recurse -Force reference\siyuan -ErrorAction SilentlyContinue
git clone --depth 1 --single-branch --branch $tag --no-tags https://github.com/siyuan-note/siyuan.git reference/siyuan
```

第三方参考仓库跟随 `main`，同样用新克隆刷新：

```powershell
Remove-Item -Recurse -Force reference\siyuan-plugin-share -ErrorAction SilentlyContinue
git clone --depth 1 --single-branch https://github.com/b8l8u8e8/siyuan-plugin-share.git reference/siyuan-plugin-share
```

`reference/` 已写进 `.gitignore`，且不在任何 `tsconfig` / Vite 入口范围内，因此 `pnpm check` 和
`pnpm build` 都不会扫到它。CodeGraph 能索引它，仅因为 `codegraph.json` 用 `includeIgnored` 显式放行；
替换参考代码后需执行 `codegraph index` 重建索引（Windows 上要先停掉占用 `codegraph.db` 的
CodeGraph daemon）。

## 许可证

MIT

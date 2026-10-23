# 思源发布器（SiYuan Publisher）

一个用于发布思源笔记的思源插件。**目前仍在开发中。**

[English](./README.md)

## 当前状态

- 插件 id：`siyuan-plugin-webshare`
- 显示名称：思源发布器 / SiYuan Publisher
- 版本：`0.1.0`
- 作者：【待填写】
- 仓库地址：【待填写】

项目基于 `plugin-sample-vite-svelte` 模板初始化。目前完成两个里程碑：把当前文档导出为可静态托管的 HTML 产物，以及把该产物上传到可独立运行的静态发布服务器。

## 环境要求

- Node.js >= 24（插件与服务端）
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

## 云端发布（里程碑 B）

插件可以把产物上传到 `server/` 下的独立静态发布服务。服务端只保存字节并从 `/p/<id>/` 提供文件，
不解析、不改写、不 sanitize、不渲染 HTML。访客浏览器执行思源自带的导出运行时，因此公式和图表的
渲染效果与本地产物一致。

### 启动服务端

```bash
cd server
cp .env.example .env
# 把 PUBLISH_TOKEN 改成至少 32 字符的随机值
pnpm install
pnpm dev
```

配置、部署和安全说明见 `server/README.md`。服务端必须挂在域名根路径（`/api/*`、`/p/*`），
本期不支持反向代理子路径部署。

### 配置与发布

打开插件设置（思源设置 → 插件 → 思源发布器 → 设置），填写：

- **发布服务器地址**：只填 origin，例如 `https://publish.example.com`
- **发布服务器 token**：服务端的 `PUBLISH_TOKEN`
- **测试连接**：校验地址与 token 是否可用

打开文档后，从命令面板或顶栏菜单运行 **发布到服务器**。对话框会显示导出、上传进度和最终 URL；
关闭对话框会中止本次发布。每次发布都会生成新的不可变 URL，不会覆盖上一份。

发布服务器 token 不是思源 API token。插件只在读取本地产物时使用思源 API token。

### 当前限制

- 不做 HTML sanitize。只有 token 持有者能上传，但发布页会在你的域名下执行 inline script；
  请使用独立域名，不要在该域名下保留 cookie 或管理后台。
- 不做共享资源去重。每份产物都带一份 `stage/` 和 `appearance/`，单篇文档通常几十 MB；
  `public/` 会线性增长。
- 没有访问控制、过期时间、删除 API、发布历史或稳定 URL。
- 服务端必须挂在域名根路径；`/p/<id>` 会 301 到 `/p/<id>/`，因为导出页使用相对资源路径。
- 本地产物是临时的。请在重启思源或锁定加密笔记本前完成发布。

### 验证

```bash
pnpm check:all   # 插件类型/Svelte + 服务端类型检查 + 服务端测试
pnpm build       # 生成插件 dist/ 和 package.zip
pnpm server:build
```

服务端测试覆盖鉴权、CORS 预检、创建/上传/提交、静态托管、末尾斜杠重定向、路径穿越、manifest
不一致、大小限制和 staging 清理。端到端验证时，上传一份真实产物，在另一台设备打开返回的 URL，
检查图片、emoji、代码高亮、公式、mermaid、echarts、graphviz、flowchart、mindmap 和 abc。

## 开发

```bash
pnpm i
pnpm make-link   # 把 dev/ 软链到 <工作区>/data/plugins/siyuan-plugin-webshare
pnpm dev         # 同时监听前端和 kernel 两个 bundle
pnpm server:dev  # 监听独立发布服务端
```

然后在思源集市中启用插件，按 `Ctrl+Shift+I` 打开开发者工具。

验证：

```bash
pnpm check        # 只检查插件
pnpm check:all    # 插件 + 服务端类型检查 + 服务端测试
pnpm build        # 生成 dist/ 和 package.zip
pnpm server:build # 编译独立服务端
```

`pnpm make-install` 会先构建，再把 `dist/` 复制到思源插件目录（不使用软链）。

如果思源处于锁屏状态，`make-install` 无法查询工作区列表。请先解锁思源，或把
`SIYUAN_PLUGIN_DIR` 设为 `<workspace>/data/plugins`。

## 目录结构

| 路径 | 用途 |
| --- | --- |
| `src/index.ts` | 前端入口（生成 `index.js`） |
| `src/kernel.ts` | Kernel 入口（生成 `kernel.js`，无 DOM / Node 内置模块） |
| `src/kernel-capture/` | 模板自带的外部摘录服务示例 |
| `src/publish/` | 产物导出、文件枚举、服务端客户端、上传编排、进度对话框 |
| `server/` | 独立 Fastify 静态发布服务（自带 package、tsconfig 和测试） |
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

# AGENTS.md

思源（SiYuan）插件项目，基于 `plugin-sample-vite-svelte` 模板：Vite + TypeScript + Svelte 5，包管理用 pnpm。
仓库包含两个可独立构建的单元：根目录的思源插件，以及 `server/` 下独立的 TypeScript/Fastify 静态发布服务。
注意！：任何改动都需要同步创建或更新README*.md和AGENTS.md，时刻保持最新版。

## 身份注意

- 插件 id 是 `siyuan-plugin-webshare`，显示名「思源发布器」；`package.json` 与 `plugin.json` 已同步。
- 作者、仓库地址等未知字段目前是 `【待填写】` 中文占位，正式发布前必须替换。
- `scripts/utils.js` 用 `plugin.json.name` 决定安装/软链目录。改名必须同时改两个 JSON，并处理已存在的插件目录。
- `README.md` / `README.zh-CN.md` 已是项目说明；上游模板文档保留在 `docs/` 和模板仓库。

## 命令

- 安装：`pnpm i`（workspace 会同时安装插件的根依赖和 `server/`）。
- 插件验证：`pnpm check`（`tsc` 两次 + `svelte-check`）。
- 全量验证：`pnpm check:all`（插件 + 服务端类型检查 + 服务端测试）。CI 构建前强制执行。
- 生产构建：`pnpm build`（`clean` → `build:app` → `build:kernel`）
- 开发监听：`pnpm dev`（并行 watch 前端和 kernel 两个 bundle）
- 服务端：`pnpm server:dev` / `pnpm server:check` / `pnpm server:test` / `pnpm server:build` / `pnpm server:start`
- 版本：`pnpm update-version`（同时写 `package.json` 和 `plugin.json`）
- 插件没有测试框架、ESLint 或 Prettier；不要臆造插件侧的 `pnpm test` / `pnpm lint`。服务端用 Node 内置 test runner + Fastify 集成测试，入口是 `pnpm server:test`。

## 构建模型（容易踩坑）

- **前端入口** `src/index.ts` → `dist/index.js`（CJS）+ `dist/index.css`；`siyuan`、`process` 为 external。运行在浏览器/Electron 渲染进程。
- **Kernel 入口** `src/kernel.ts` → `dist/kernel.js`（IIFE）。运行在 kernel 的 goja 运行时：没有 DOM，也没有 `fs` / `child_process` / `net` 等通用 Node 模块。
- `vite.config.ts` 用 `NODE_ENV` 和 `VITE_BUILD_TARGET` 切换产物：development 输出到 `dev/`，production 输出到 `dist/`。不要直接跑 `vite build`，用 `pnpm` 脚本。
- `package.zip` 只在 production 的 kernel 构建中由 `zipPack` 生成；只跑 `build:app` 不会产出 zip。
- `viteStaticCopy` 会把 `README*.md`、`docs/`、`asset/`、`plugin.json`、icon/preview 复制进 `dist/`。README 用到的图片必须放在 `asset/`。
- 构建时会从 `dist/i18n` 删除 YAML/Markdown，只保留 JSON。
- `server/` 有自己的 `package.json` / `tsconfig.json` / `dist/`，不参与 Vite 构建，不进入 `package.zip`。根 `tsconfig.json` 只 include `src/`，不要把它并进插件类型检查。

## 代码结构

- `src/index.ts`：前端插件类 `SiYuanPublisherPlugin`，注册顶栏菜单、命令、dock、tab 和设置面板；命令 `exportPublishArtifact` 导出当前文档，`publishDocument` 导出并上传到发布服务器。
- `src/kernel.ts`：Kernel 生命周期；用 `api.rpc.bind` 注册 `echo`、`readSampleStorage`。
- `src/api.ts`：思源 HTTP API 封装；`request()` 返回 `{ ok, raw, data }`。
- `src/kernel-capture/`：外部摘录服务。
  - `kernel-service.ts` 设置私有 HTTP handler：`GET /status`、`GET /capture`、`PUT /capture/config`、`POST /capture`。
  - 写入流程：`/api/filetree/createDailyNote` + `/api/block/appendBlock`；状态用 `api.storage` 持久化。
  - `contracts.ts` 是前后端共享类型。
  - 前端与 kernel 通过 `kernel.rpc.bind/broadcast` 通信，事件为 `notify`、`capture-received`。
- `src/publish/`：静态发布产物与云端发布。
  - `template.ts`：按思源原生 `app/src/protyle/export/index.ts` 的 `onExport` 固化 `index.html`；固定浅色主题，不含插件 CSS、代码片段、自定义字体、移动端附加和书签图标。
  - `exporter.ts`：`exportHTML`（`pdf:false`、`savePath:""`）→ 校验 → 模板 → `/api/file/putFile` 写 `temp/export/<folder>/index.html`，返回 `{ folder, absoluteDir, name }`。
  - `artifact-files.ts`：通过 `/api/file/readDir` 递归枚举产物，通过 `/api/file/getFile` 严格读取单个文件；拒绝符号链接，失败不返回 `null`。
  - `publish-client.ts`：发布服务器 HTTP 客户端（health / create / upload / complete），处理 Bearer token、超时、取消和结构化错误。
  - `publisher.ts`：导出 → 枚举 → 创建 → 4 并发上传 → 提交；维护 manifest 和进度；失败即中止。
  - `publish-dialog.svelte`：发布进度、失败详情、公开 URL 和复制；关闭对话框即中止。
  - `errors.ts` / `types.ts`：发布阶段、错误字段、配置、进度、manifest、服务端响应类型。
- `server/`：独立 TypeScript/Fastify 服务。
  - `src/index.ts` 启动；`app.ts` 组装 Fastify/CORS/multipart/static；`routes.ts` 定义 API；`auth.ts` 校验 Bearer；`storage.ts` 负责 id、路径校验、流式写入、manifest 校验、原子提交和 staging 清理；`config.ts` 读取环境变量。
  - `test/` 使用 Node 内置 test runner 和 Fastify 实例，覆盖鉴权、CORS、上传、静态托管、路径穿越、manifest 不一致和大小限制。
  - 运行时数据在 `server/data/`（staging/public），已被 git 忽略；`server/.env` 也不入库。
- `src/libs/`：`SettingUtils`（存储名 `menu-config`）、`svelteDialog`、Form 组件等。
- 路径别名 `@/` → `src/`。

## 发布产物（里程碑 A）

- 导出入口：`src/index.ts` 的 `exportPublishArtifact` 命令；只用 `editorCallback`（需要活动文档）。
- `/api/export/exportHTML` 传 `savePath: ""`，返回 `{ id, name, content, folder }`；`content` 是 body 片段，内核把资源写进 `<工作区>/temp/export/<folder>`，**不会写 `index.html`**，必须由插件补。
- `pdf` 是契约必填字段，即使导出 HTML 也要显式传 `false`。
- 只导出当前文档：`exportHTML` 不传 `merge`（内核默认 `false`），不合并子文档。
- 不要调用 `/api/export/exportBrowserHTML`：它会写 `index.html`、打包 zip 并**删除整个目录**。
- `<工作区>/temp/export/**` 在 `/api/file/*` 白名单内；`temp/` 其余路径是敏感路径。
- 产物是临时的：内核启动/退出清空 `temp/export`；加密笔记本锁定清空 `temp/export/<boxID>`。B 阶段上传前不要重启/锁定。
- 模板必须保留内联的 `window.siyuan` 引导和 `Protyle.*Render` 调用（highlight/math/mermaid/flowchart/graphviz/chart/mindmap/abc/html/tabs/plantuml），否则公式和图表只剩 `data-content` 占位。
- 固定浅色：`data-theme-mode="light"` 且 bootstrap 的 `appearance.mode` 固定为 `0`；主题 CSS 用当前浅色主题。
- 验证：`pnpm check` + `pnpm build`；本地用静态服务器指向产物目录，检查图片、emoji、代码高亮、公式、图表。

## 云端发布（里程碑 B）

- 架构：插件上传整个产物目录，服务端只保存字节并提供静态文件；不解析、不改写、不 sanitize、不渲染 HTML。访客浏览器执行思源导出页的原生 JS。
- 服务端 API：`GET /api/health`、`POST /api/publications`、`PUT /api/publications/:id/files?path=...`（multipart 单文件）、`POST /api/publications/:id/complete`。所有 `/api/*` 需要 `Authorization: Bearer <PUBLISH_TOKEN>`。
- 存储：`server/data/staging/<id>` 上传中，`server/data/public/<id>` 已提交；complete 校验 manifest（路径、大小、`index.html`、多余文件、限额）后原子 rename。staging 启动时和每 24 小时清理；public 不自动删除。
- 静态：`/p/<id>/` 由 `@fastify/static` 托管；`/p/<id>` 必须 301 到 `/p/<id>/`，否则 `<base href="">` + 相对资源路径会解析到 `/p/`。本期不支持子路径部署。
- 服务端必须挂在域名根路径；`PUBLISH_DATA_DIR`、`.env`、`data/` 不入库。
- 安全：本期不做 sanitize，发布页会执行 inline script；使用独立域名、无 cookie/管理后台，生产 HTTPS。token 不写日志。
- 体积：每份产物重复 `stage/`、`appearance/`，不做共享资源去重；`public/` 线性增长，需手动清理。
- 插件端读取产物：统一用 `/temp/export/<folder>/<relative>`；`getFile` 在思源 API token 非空时必须带 `Authorization: Token <token>`；`readDir` 返回项没有 size，大小在上传时从 Blob 取。`getFileBlob` 失败返回 null，不要用于发布。
- 插件端错误：`PublishError` 带 stage/path/status/requestId；上传失败不跳过、不自动重试、不静默成功。关闭发布对话框会 abort，服务端 staging 由 TTL 清理。
- 配置：插件设置 key 为 `publishServerUrl` / `publishServerToken`；地址只允许 origin，不允许路径；发布 token 与思源 API token 不同。
- 验证：`pnpm check:all`、`pnpm server:build`；真实产物上传后检查 `public/<id>` 文件数/字节数与本地一致，并访问 `/p/<id>/` 及 CSS/JS/图片。

## 约定与陷阱

- `tsconfig.json` 的 `strict` 是 `false`，但 `noUnusedLocals` / `noUnusedParameters` 为 `true`，且 `checkJs` 开启：未使用的 import 或参数会让 `pnpm check` 失败。
- 新增 UI 文案必须同时改 `public/i18n/en.json` 和 `zh-CN.json`，代码里用 `this.i18n.<key>` 读取。`public/i18n` 也支持 YAML，构建时由 `yaml-plugin.js` 转成 JSON（当前项目用 JSON）。
- `this.i18n` 的静态类型是平铺字符串；访问 `publish` 嵌套对象时要 `as unknown as Record<string, string>`，不要假设它有嵌套类型。
- 插件设置走 `SettingUtils`（原生 `plugin.setting`）。`src/index.ts` 已删除模板对 `openSetting()` 的覆盖；不要恢复 Svelte 演示设置面板，否则发布服务器配置不会出现在插件设置中。
- 发布 token 只用于 `server/` 的 Bearer 鉴权；读写思源内核用 `window.siyuan.config.api.token`（`Token` 方案），两者不能混用。
- `server/data/` 与 `server/.env` 已忽略；不要提交运行时数据或真实 token。
- 前端读写工作区 `data/` 下的文件必须走 `/api/file/*`，不要直接调用 `fs`，否则可能破坏同步数据。
- 手动创建日记时要补 `custom-dailynote-yyyymmdd` 属性；调用 `/api/filetree/createDailyNote` 则会自动补。
- 前端与 Kernel 生命周期独立：前端收到 `kernel-plugin-state-change` 后，才能假定 Kernel RPC 可用。
- Svelte 5 用 runes（`$props`、`$state`）和 `mount` / `unmount`，不要用 Svelte 4 的 `$destroy` 写法。

## 本地联调

- `pnpm make-link`：把 `dev/` 软链到 `<workspace>/data/plugins/<plugin.json 的 name>`。
- Windows 创建目录软链需要开发者模式或管理员权限；否则用 `pnpm make-link-win`。
- 设置环境变量 `SIYUAN_PLUGIN_DIR`（值为 `<workspace>/data/plugins`）可让 `make-link` / `make-install` 跳过工作区探测；SiYuan 锁屏时 `getWorkspaces` 会返回 401。
- `pnpm make-install`：先构建，再把 `dist/` 复制到插件目录。
- `dev/`、`dist/`、`package.zip` 都是生成物，不要手改。
- 服务端单独联调：`cd server`，复制 `.env.example` 为 `.env`，设置至少 32 字符的 `PUBLISH_TOKEN`，然后 `pnpm dev`。本地测试可用 `pnpm server:test`。
- 服务端默认只监听 `127.0.0.1:8787`；跨机器测试时设置 `HOST=0.0.0.0`，生产建议用反向代理终止 TLS。

## 参考代码（`reference/`，不入库、不参与构建）

- `reference/siyuan/`：思源本体 `v3.8.8` 源码（`--depth 1`、detached HEAD）。查 HTTP API 时看 `kernel/api/*.go` + `kernel/apicontract/contracts.go`，前端类型看 `app/src/types/api/index.d.ts`。
- `reference/siyuan-plugin-share/`：第三方分享插件（根目录 `index.js` 是构建产物，`php-site/` 是服务端），只作实现参考。
- 两者在 `.gitignore` 里整体忽略；`tsconfig.json` 的 `include` 与 `vite.config.ts` 的入口只指向 `src/`，所以 `pnpm check` / `pnpm build` 不会扫到。
- 更新思源源码：`git -C reference/siyuan fetch --depth 1 origin tag vX.Y.Z` 然后 `git -C reference/siyuan checkout vX.Y.Z`。
- CodeGraph 默认不索引被 `.gitignore` 的嵌套仓库；根目录 `codegraph.json` 用 `includeIgnored` 显式放行 `reference/`，`deprioritize` 保证本项目代码在搜索排序中优先。改完配置要停掉 codegraph daemon 再 `codegraph index`（`codegraph sync` 不会重建索引）。

## 发布

- 流程：`pnpm update-version` → 提交 → `git tag vX.Y.Z && git push origin vX.Y.Z`。
- CI 会校验 tag 版本与 `package.json`、`plugin.json` 一致，然后跑 `pnpm check:all`、`pnpm build`、`pnpm server:build` 并上传 `package.zip`。服务端不进入插件包。
- Kernel 运行时模型见 `docs/kernel-plugin.md` 和 `docs/kernel-capture-demo.md`（会随包发布）。

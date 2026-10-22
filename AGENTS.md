# AGENTS.md

思源（SiYuan）插件项目，基于 `plugin-sample-vite-svelte` 模板：Vite + TypeScript + Svelte 5，包管理用 pnpm。

## 身份注意

- 插件 id 是 `siyuan-plugin-publisher`，显示名「思源发布器」；`package.json` 与 `plugin.json` 已同步。
- 作者、仓库地址等未知字段目前是 `【待填写】` 中文占位，正式发布前必须替换。
- `scripts/utils.js` 用 `plugin.json.name` 决定安装/软链目录。改名必须同时改两个 JSON，并处理已存在的插件目录。
- `README.md` / `README.zh-CN.md` 已是项目说明；上游模板文档保留在 `docs/` 和模板仓库。

## 命令

- 安装：`pnpm i`
- 验证：`pnpm check`（`tsc` 两次 + `svelte-check`）。CI 构建前强制执行。
- 生产构建：`pnpm build`（`clean` → `build:app` → `build:kernel`）
- 开发监听：`pnpm dev`（并行 watch 前端和 kernel 两个 bundle）
- 版本：`pnpm update-version`（同时写 `package.json` 和 `plugin.json`）
- 没有测试框架、ESLint 或 Prettier。不要臆造 `pnpm test` / `pnpm lint`；验证就是 `pnpm check` + `pnpm build`。

## 构建模型（容易踩坑）

- **前端入口** `src/index.ts` → `dist/index.js`（CJS）+ `dist/index.css`；`siyuan`、`process` 为 external。运行在浏览器/Electron 渲染进程。
- **Kernel 入口** `src/kernel.ts` → `dist/kernel.js`（IIFE）。运行在 kernel 的 goja 运行时：没有 DOM，也没有 `fs` / `child_process` / `net` 等通用 Node 模块。
- `vite.config.ts` 用 `NODE_ENV` 和 `VITE_BUILD_TARGET` 切换产物：development 输出到 `dev/`，production 输出到 `dist/`。不要直接跑 `vite build`，用 `pnpm` 脚本。
- `package.zip` 只在 production 的 kernel 构建中由 `zipPack` 生成；只跑 `build:app` 不会产出 zip。
- `viteStaticCopy` 会把 `README*.md`、`docs/`、`asset/`、`plugin.json`、icon/preview 复制进 `dist/`。README 用到的图片必须放在 `asset/`。
- 构建时会从 `dist/i18n` 删除 YAML/Markdown，只保留 JSON。

## 代码结构

- `src/index.ts`：前端插件类（类名仍是 `PluginSample`），注册顶栏菜单、命令、dock、tab 和设置面板。
- `src/kernel.ts`：Kernel 生命周期；用 `api.rpc.bind` 注册 `echo`、`readSampleStorage`。
- `src/api.ts`：思源 HTTP API 封装；`request()` 返回 `{ ok, raw, data }`。
- `src/kernel-capture/`：外部摘录服务。
  - `kernel-service.ts` 设置私有 HTTP handler：`GET /status`、`GET /capture`、`PUT /capture/config`、`POST /capture`。
  - 写入流程：`/api/filetree/createDailyNote` + `/api/block/appendBlock`；状态用 `api.storage` 持久化。
  - `contracts.ts` 是前后端共享类型。
  - 前端与 kernel 通过 `kernel.rpc.bind/broadcast` 通信，事件为 `notify`、`capture-received`。
- `src/libs/`：`SettingUtils`（存储名 `menu-config`）、`svelteDialog`、Form 组件等。
- 路径别名 `@/` → `src/`。

## 约定与陷阱

- `tsconfig.json` 的 `strict` 是 `false`，但 `noUnusedLocals` / `noUnusedParameters` 为 `true`，且 `checkJs` 开启：未使用的 import 或参数会让 `pnpm check` 失败。
- 新增 UI 文案必须同时改 `public/i18n/en.json` 和 `zh-CN.json`，代码里用 `this.i18n.<key>` 读取。`public/i18n` 也支持 YAML，构建时由 `yaml-plugin.js` 转成 JSON（当前项目用 JSON）。
- 前端读写工作区 `data/` 下的文件必须走 `/api/file/*`，不要直接调用 `fs`，否则可能破坏同步数据。
- 手动创建日记时要补 `custom-dailynote-yyyymmdd` 属性；调用 `/api/filetree/createDailyNote` 则会自动补。
- 前端与 Kernel 生命周期独立：前端收到 `kernel-plugin-state-change` 后，才能假定 Kernel RPC 可用。
- Svelte 5 用 runes（`$props`、`$state`）和 `mount` / `unmount`，不要用 Svelte 4 的 `$destroy` 写法。

## 本地联调

- `pnpm make-link`：把 `dev/` 软链到 `<workspace>/data/plugins/<plugin.json 的 name>`。
- Windows 创建目录软链需要开发者模式或管理员权限；否则用 `pnpm make-link-win`。
- 设置环境变量 `SIYUAN_PLUGIN_DIR` 可直接指定插件目录，跳过交互选择。
- `pnpm make-install`：先构建，再把 `dist/` 复制到插件目录。
- `dev/`、`dist/`、`package.zip` 都是生成物，不要手改。

## 发布

- 流程：`pnpm update-version` → 提交 → `git tag vX.Y.Z && git push origin vX.Y.Z`。
- CI 会校验 tag 版本与 `package.json`、`plugin.json` 一致，然后跑 `pnpm check`、`pnpm build` 并上传 `package.zip`。
- Kernel 运行时模型见 `docs/kernel-plugin.md` 和 `docs/kernel-capture-demo.md`（会随包发布）。

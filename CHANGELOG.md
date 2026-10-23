# Changelog

## 0.1.0

- 基于 `plugin-sample-vite-svelte` 模板初始化项目。
- 插件身份定为 `siyuan-plugin-webshare`（文档公网分享 / Doc Web Share），避开集市上同名的第三方插件。
- 初始化开发环境，并把 `dev/` 链入思源工作区。
- 里程碑 A：支持把当前文档导出为自包含静态 HTML 产物，并在本地静态服务器验证。
- 里程碑 B：新增独立 TypeScript/Fastify 发布服务，支持创建发布、流式上传、manifest 校验、
  原子提交与静态托管；插件新增发布命令、设置项、进度对话框和公开 URL 展示。
- 服务端新增鉴权、CORS、路径穿越防护、大小限制、staging 清理及 33 个自动化测试。
- 清理前端入口中的模板示例，统一归档到 `src/examples/frontend-examples.ts`（注释保留）；顶栏改用文档 + 地球的简化图标。
- 移除「Kernel Plugin 示例：外部摘录服务」入口及其 Kernel 服务，代码与文档归档到 `src/examples/`（注释保留，不随包发布）。

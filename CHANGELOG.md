# Changelog

## 0.1.0

- 基于 `plugin-sample-vite-svelte` 模板初始化项目。
- 插件身份定为 `siyuan-plugin-webshare`（思源发布器），避开集市上同名的第三方插件。
- 初始化开发环境，并把 `dev/` 链入思源工作区。
- 里程碑 A：支持把当前文档导出为自包含静态 HTML 产物，并在本地静态服务器验证。
- 里程碑 B：新增独立 TypeScript/Fastify 发布服务，支持创建发布、流式上传、manifest 校验、
  原子提交与静态托管；插件新增发布命令、设置项、进度对话框和公开 URL 展示。
- 服务端新增鉴权、CORS、路径穿越防护、大小限制、staging 清理及 33 个自动化测试。

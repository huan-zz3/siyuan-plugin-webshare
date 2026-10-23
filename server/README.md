# 文档公网分享服务端

这是 `siyuan-plugin-webshare` 的独立静态发布服务。它只做四件事：Bearer 鉴权、接收上传、校验文件清单、静态托管。它不解析、不改写、不 sanitize HTML。

服务端与插件源码完全隔离：本目录有独立的 `package.json`、`tsconfig.json` 和构建产物，不 import 根目录的 `src/`。

## 环境要求

- Node.js >= 24
- pnpm 11

## 配置

复制 `.env.example` 为 `.env`，至少修改 `PUBLISH_TOKEN`：

```bash
cd server
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

把生成的值写入 `PUBLISH_TOKEN`。服务启动时会检查 token 长度，少于 32 字符将拒绝启动。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | 监听端口 |
| `HOST` | `127.0.0.1` | 监听地址；生产环境建议只监听本机，由反向代理转发 |
| `PUBLISH_DATA_DIR` | `./data` | 数据目录；相对路径以启动目录为准 |
| `PUBLISH_TOKEN` | 无 | 必填，至少 32 字符 |
| `MAX_FILE_BYTES` | `67108864` | 单文件上限 |
| `MAX_PUBLICATION_BYTES` | `536870912` | 单次发布总字节上限 |
| `MAX_FILES` | `5000` | 单次发布文件数上限 |
| `STAGING_TTL_HOURS` | `24` | 未完成上传的保留时间 |
| `LOG_LEVEL` | `info` | `fatal` / `error` / `warn` / `info` / `debug` / `trace` / `silent` |

服务启动时会自动创建：

```text
<PUBLISH_DATA_DIR>/
  staging/<id>/   # 上传中的临时发布
  public/<id>/    # 已完成的公开发布
```

`staging` 会在启动时和每 24 小时清理一次过期目录。`public` 不会自动删除。

## 开发与构建

```bash
cd server
pnpm install
pnpm dev        # tsx watch
pnpm check      # 类型检查
pnpm test       # Node 内置测试运行器 + 集成测试
pnpm build      # 输出 dist/
pnpm start      # node dist/index.js
```

也可以在仓库根目录执行：

```bash
pnpm server:dev
pnpm server:check
pnpm server:test
pnpm server:build
pnpm server:start
```

## HTTP API

所有 `/api/*` 请求都需要：

```text
Authorization: Bearer <PUBLISH_TOKEN>
```

静态 `/p/*` 不需要鉴权。

### 健康检查

```http
GET /api/health
```

### 创建发布

```http
POST /api/publications
Content-Type: application/json

{"title":"文档标题","docId":"20260101000000-abcdefg"}
```

返回 `id` 和 `path`。服务端会创建 `staging/<id>/`。

### 上传文件

```http
PUT /api/publications/<id>/files?path=<urlencoded relative path>
Content-Type: multipart/form-data
```

只允许一个文件字段，字段名为 `file`。路径使用 query 参数，按原目录结构保存。允许覆盖同一路径，便于单文件重试；已经提交的发布不接受上传。

### 提交发布

```http
POST /api/publications/<id>/complete
Content-Type: application/json

{"files":[{"path":"index.html","size":1234},{"path":"assets/a.png","size":5678}]}
```

服务端会逐项核对：

- 每个路径都安全
- 文件存在且大小一致
- `index.html` 存在且非空
- 没有 manifest 之外的多余文件
- 文件数和总字节数没有超限

全部通过后，`staging/<id>` 会原子改名为 `public/<id>`，并返回公开路径。任何一项失败都返回 `409`，不会提交。

### 静态访问

```text
https://<host>/p/<id>/
```

`/p/<id>` 会 301 重定向到 `/p/<id>/`。这是必要的：导出页使用相对资源路径，缺少末尾斜杠会导致 CSS/JS 404。

## 安全说明

- 服务端不做 HTML sanitize。上传的页面会在你的域名下执行 inline script。请使用独立域名或子域名，并确保该域名不承载登录态或管理后台。
- 生产环境请使用 HTTPS；`PUBLISH_TOKEN` 是 Bearer 凭据，不要写进公开页面。
- 默认只监听 `127.0.0.1`，建议由 Caddy/Nginx 终止 TLS 后反向代理。
- 不要直接把 `PUBLISH_DATA_DIR` 作为 Web 根目录暴露；只通过本服务的 `/p/` 路由访问。
- 本期不做限速、访问控制、过期时间或删除 API。需要时在反向代理层限速，并手动删除 `public/<id>`。

## 部署示例

```bash
cd server
pnpm install --prod=false
pnpm build
PUBLISH_DATA_DIR=/var/lib/siyuan-publisher \
PUBLISH_TOKEN=<your-token> \
HOST=127.0.0.1 PORT=8787 \
node dist/index.js
```

建议用 systemd 托管进程，用 Caddy/Nginx 反向代理 `/api/*` 和 `/p/*` 并启用 HTTPS。数据备份只需要备份 `PUBLISH_DATA_DIR/public/`。

## 测试

`pnpm test` 会启动临时 Fastify 实例并覆盖：

- 鉴权、CORS 预检
- 创建、上传、提交、静态访问
- 301 末尾斜杠
- 路径穿越
- manifest 缺文件、多余文件、大小不一致、空 index
- 单文件大小限制
- 旧 staging 清理

真实产物的端到端验证见仓库 `README.md` 的“云端发布”章节。

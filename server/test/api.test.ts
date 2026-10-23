import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";

import { buildApp } from "../src/app.js";
import { loadConfig, type ServerConfig } from "../src/config.js";
import { ensureDataLayout, isPublicationId } from "../src/storage.js";

const TOKEN = "0123456789abcdef0123456789abcdef";
const DOC_ID = "20260101000000-abcdefg";

let app: FastifyInstance;
let dataDir: string;
let baseUrl: string;

function configFor(dir: string, overrides: Partial<ServerConfig> = {}): ServerConfig {
    const config = loadConfig({
        PUBLISH_TOKEN: TOKEN,
        PUBLISH_DATA_DIR: dir,
        LOG_LEVEL: "silent",
    });
    return { ...config, ...overrides };
}

async function listen(instance: FastifyInstance): Promise<string> {
    await instance.listen({ host: "127.0.0.1", port: 0 });
    const address = instance.server.address();
    if (address === null || typeof address === "string") {
        throw new Error("Expected an ephemeral TCP port.");
    }
    return `http://127.0.0.1:${address.port}`;
}

function auth(token = TOKEN): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
}

async function createPublication(url = baseUrl, token = TOKEN): Promise<{ id: string; path: string }> {
    const response = await fetch(`${url}/api/publications`, {
        method: "POST",
        headers: { ...auth(token), "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Test document", docId: DOC_ID }),
    });
    assert.equal(response.status, 201);
    return await response.json() as { id: string; path: string };
}

async function uploadFile(
    id: string,
    path: string,
    content: Buffer | string,
    url = baseUrl,
    token = TOKEN,
): Promise<Response> {
    const form = new FormData();
    form.append("file", new Blob([content]), "upload.bin");
    return fetch(`${url}/api/publications/${id}/files?path=${encodeURIComponent(path)}`, {
        method: "PUT",
        headers: auth(token),
        body: form,
    });
}

async function completePublication(
    id: string,
    files: Array<{ path: string; size: number }>,
    url = baseUrl,
    token = TOKEN,
): Promise<Response> {
    return fetch(`${url}/api/publications/${id}/complete`, {
        method: "POST",
        headers: { ...auth(token), "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
    });
}

before(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "siyuan-publisher-api-"));
    await ensureDataLayout(dataDir);
    app = await buildApp(configFor(dataDir));
    baseUrl = await listen(app);
});

after(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
});

describe("authentication", () => {
    it("rejects missing and wrong tokens", async () => {
        assert.equal((await fetch(`${baseUrl}/api/health`)).status, 401);
        assert.equal((await fetch(`${baseUrl}/api/health`, { headers: auth("wrong-token") })).status, 401);
    });

    it("reports service information with a valid token", async () => {
        const response = await fetch(`${baseUrl}/api/health`, { headers: auth() });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
            ok: true,
            service: "siyuan-publisher-server",
            version: 1,
        });
    });

    it("answers CORS preflight without authentication", async () => {
        const response = await fetch(`${baseUrl}/api/publications`, {
            method: "OPTIONS",
            headers: {
                Origin: "app://siyuan",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        });
        assert.equal(response.status, 204);
        assert.equal(response.headers.get("access-control-allow-origin"), "*");
    });
});

describe("publication lifecycle", () => {
    it("creates, uploads, commits, and serves a publication", async () => {
        const created = await createPublication();
        assert.equal(isPublicationId(created.id), true);
        assert.equal(created.path, `/p/${created.id}/`);

        const index = Buffer.from("<!DOCTYPE html><html><body>Hello</body></html>");
        const css = Buffer.from("body{color:red}");
        const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

        assert.equal((await uploadFile(created.id, "index.html", index)).status, 204);
        assert.equal((await uploadFile(created.id, "assets/app.css", css)).status, 204);
        assert.equal((await uploadFile(created.id, "assets/图片 1.png", png)).status, 204);

        const completed = await completePublication(created.id, [
            { path: "index.html", size: index.length },
            { path: "assets/app.css", size: css.length },
            { path: "assets/图片 1.png", size: png.length },
        ]);
        assert.equal(completed.status, 200);
        assert.deepEqual(await completed.json(), {
            id: created.id,
            path: `/p/${created.id}/`,
            fileCount: 3,
            totalBytes: index.length + css.length + png.length,
        });

        const redirect = await fetch(`${baseUrl}/p/${created.id}`, { redirect: "manual" });
        assert.equal(redirect.status, 301);
        assert.equal(redirect.headers.get("location"), `/p/${created.id}/`);

        const page = await fetch(`${baseUrl}/p/${created.id}/`);
        assert.equal(page.status, 200);
        assert.equal(page.headers.get("cache-control"), "no-cache");
        assert.equal(page.headers.get("x-content-type-options"), "nosniff");
        assert.equal(await page.text(), index.toString());

        const asset = await fetch(`${baseUrl}/p/${created.id}/assets/app.css`);
        assert.equal(asset.status, 200);
        assert.match(asset.headers.get("content-type") ?? "", /text\/css/);
        assert.equal(asset.headers.get("cache-control"), "public, max-age=31536000, immutable");
        assert.equal(await asset.text(), css.toString());

        const unicodeAsset = await fetch(`${baseUrl}/p/${created.id}/assets/${encodeURIComponent("图片 1.png")}`);
        assert.equal(unicodeAsset.status, 200);

        const missing = await fetch(`${baseUrl}/p/${created.id}/missing.txt`);
        assert.equal(missing.status, 404);

        for (const path of ["%2e%2e/%2e%2e/package.json", "..%2f..%2fserver%2fpackage.json"]) {
            const traversal = await fetch(`${baseUrl}/p/${created.id}/${path}`);
            assert.notEqual(traversal.status, 200, `static traversal returned 200 for ${path}`);
        }
    });

    it("rejects uploads to a committed publication", async () => {
        const created = await createPublication();
        const index = Buffer.from("<html></html>");
        assert.equal((await uploadFile(created.id, "index.html", index)).status, 204);
        assert.equal((await completePublication(created.id, [{ path: "index.html", size: index.length }])).status, 200);

        const response = await uploadFile(created.id, "late.txt", "late");
        assert.equal(response.status, 409);
        assert.equal((await response.json() as { error: string }).error, "already_committed");
    });

    it("rejects uploads to an unknown publication", async () => {
        const response = await uploadFile("aaaaaaaaaaaaaaaa", "index.html", "x");
        assert.equal(response.status, 404);
    });
});

describe("validation", () => {
    it("rejects invalid creation metadata", async () => {
        const response = await fetch(`${baseUrl}/api/publications`, {
            method: "POST",
            headers: { ...auth(), "Content-Type": "application/json" },
            body: JSON.stringify({ title: "bad\ntitle", docId: DOC_ID }),
        });
        assert.equal(response.status, 400);
    });

    it("rejects traversal paths", async () => {
        const created = await createPublication();
        for (const path of ["../escape.txt", "assets/../../escape.txt", "/etc/passwd", "assets\\escape.txt"]) {
            const response = await uploadFile(created.id, path, "x");
            assert.equal(response.status, 400, `expected ${path} to be rejected`);
        }
    });

    it("rejects a manifest with a missing file", async () => {
        const created = await createPublication();
        const index = Buffer.from("<html></html>");
        assert.equal((await uploadFile(created.id, "index.html", index)).status, 204);

        const response = await completePublication(created.id, [
            { path: "index.html", size: index.length },
            { path: "assets/missing.css", size: 5 },
        ]);
        assert.equal(response.status, 409);
        const body = await response.json() as { error: string; details: { missing: string[] } };
        assert.equal(body.error, "manifest_mismatch");
        assert.deepEqual(body.details.missing, ["assets/missing.css"]);
    });

    it("rejects a manifest with an extra file", async () => {
        const created = await createPublication();
        const index = Buffer.from("<html></html>");
        assert.equal((await uploadFile(created.id, "index.html", index)).status, 204);
        assert.equal((await uploadFile(created.id, "extra.txt", "extra")).status, 204);

        const response = await completePublication(created.id, [{ path: "index.html", size: index.length }]);
        assert.equal(response.status, 409);
        const body = await response.json() as { error: string; details: { extra: string[] } };
        assert.equal(body.error, "manifest_mismatch");
        assert.deepEqual(body.details.extra, ["extra.txt"]);
    });

    it("rejects an empty index.html", async () => {
        const created = await createPublication();
        assert.equal((await uploadFile(created.id, "index.html", "")).status, 204);
        const response = await completePublication(created.id, [{ path: "index.html", size: 0 }]);
        assert.equal(response.status, 409);
    });

    it("enforces the per-file size limit", async () => {
        const dir = await mkdtemp(join(tmpdir(), "siyuan-publisher-limit-"));
        await ensureDataLayout(dir);
        const instance = await buildApp(configFor(dir, {
            maxFileBytes: 8,
            maxPublicationBytes: 1024,
        }));
        const url = await listen(instance);
        try {
            const created = await createPublication(url);
            const response = await uploadFile(created.id, "index.html", Buffer.alloc(20), url);
            assert.equal(response.status, 413);
        } finally {
            await instance.close();
            await rm(dir, { recursive: true, force: true });
        }
    });
});

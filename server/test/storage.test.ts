import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, it } from "node:test";

import { AppError } from "../src/errors.js";
import {
    cleanupStaging,
    createStaging,
    ensureDataLayout,
    isPublicationId,
    resolveInside,
    validateRelativePath,
    verifyManifest,
    writeUploadedFile,
} from "../src/storage.js";

const LIMITS = {
    maxFiles: 100,
    maxFileBytes: 1024,
    maxPublicationBytes: 10 * 1024,
};

let dataDir: string;

beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "siyuan-publisher-storage-"));
    await ensureDataLayout(dataDir);
});

afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
});

describe("validateRelativePath", () => {
    it("accepts normal nested paths", () => {
        assert.equal(validateRelativePath("index.html"), "index.html");
        assert.equal(validateRelativePath("assets/图片 1.png"), "assets/图片 1.png");
        assert.equal(validateRelativePath("stage/protyle/js/lute/lute.min.js"), "stage/protyle/js/lute/lute.min.js");
    });

    it("rejects traversal and non-POSIX paths", () => {
        for (const value of [
            "",
            "../index.html",
            "assets/../../index.html",
            "/etc/passwd",
            "assets\\image.png",
            "assets//image.png",
            "assets/./image.png",
            ".hidden/file",
            "C:/temp/file",
            "assets/\0file",
        ]) {
            assert.throws(() => validateRelativePath(value), AppError, `expected ${JSON.stringify(value)} to fail`);
        }
    });

    it("rejects non-string values", () => {
        assert.throws(() => validateRelativePath(undefined), AppError);
        assert.throws(() => validateRelativePath(42), AppError);
    });
});

describe("resolveInside", () => {
    it("resolves nested paths inside the root", () => {
        const resolved = resolveInside(dataDir, "a/b/c.txt");
        assert.equal(resolved, join(dataDir, "a", "b", "c.txt"));
    });

    it("rejects a path that escapes the root", () => {
        assert.throws(() => resolveInside(dataDir, ".."), /escapes/);
    });
});

describe("createStaging", () => {
    it("creates a valid publication id", async () => {
        const { id, dir } = await createStaging(dataDir);
        assert.equal(isPublicationId(id), true);
        assert.equal(dir, join(dataDir, "staging", id));
    });
});

describe("writeUploadedFile", () => {
    it("streams a file to disk and reports its size", async () => {
        const { dir } = await createStaging(dataDir);
        const bytes = await writeUploadedFile(dir, "assets/hello.txt", Readable.from([Buffer.from("hello")]), 100);
        assert.equal(bytes, 5);
        assert.equal(await readFile(join(dir, "assets", "hello.txt"), "utf8"), "hello");
    });

    it("rejects oversized streams", async () => {
        const { dir } = await createStaging(dataDir);
        await assert.rejects(
            writeUploadedFile(dir, "big.txt", Readable.from([Buffer.alloc(20)]), 10),
            (error: unknown) => error instanceof AppError && error.statusCode === 413,
        );
    });

    it("rejects traversal before writing", async () => {
        const { dir } = await createStaging(dataDir);
        await assert.rejects(
            writeUploadedFile(dir, "../escape.txt", Readable.from([Buffer.from("x")]), 100),
            AppError,
        );
    });
});

describe("verifyManifest", () => {
    it("accepts an exact manifest", async () => {
        const { dir } = await createStaging(dataDir);
        const index = Buffer.from("<html></html>");
        const css = Buffer.from("body{}");
        await writeFile(join(dir, "index.html"), index);
        await mkdir(join(dir, "assets"));
        await writeFile(join(dir, "assets", "app.css"), css);

        const result = await verifyManifest(dir, [
            { path: "index.html", size: index.length },
            { path: "assets/app.css", size: css.length },
        ], LIMITS);

        assert.deepEqual(result, { fileCount: 2, totalBytes: index.length + css.length });
    });

    it("rejects missing files", async () => {
        const { dir } = await createStaging(dataDir);
        await writeFile(join(dir, "index.html"), "<html></html>");
        await assert.rejects(
            verifyManifest(dir, [
                { path: "index.html", size: 13 },
                { path: "assets/missing.css", size: 5 },
            ], LIMITS),
            (error: unknown) => error instanceof AppError && error.code === "manifest_mismatch",
        );
    });

    it("rejects extra files", async () => {
        const { dir } = await createStaging(dataDir);
        await writeFile(join(dir, "index.html"), "<html></html>");
        await writeFile(join(dir, "extra.txt"), "extra");
        await assert.rejects(
            verifyManifest(dir, [{ path: "index.html", size: 13 }], LIMITS),
            (error: unknown) => error instanceof AppError && error.code === "manifest_mismatch",
        );
    });

    it("rejects a size mismatch", async () => {
        const { dir } = await createStaging(dataDir);
        await writeFile(join(dir, "index.html"), "<html></html>");
        await assert.rejects(
            verifyManifest(dir, [{ path: "index.html", size: 999 }], LIMITS),
            (error: unknown) => error instanceof AppError && error.code === "manifest_mismatch",
        );
    });

    it("requires a non-empty index.html", async () => {
        const { dir } = await createStaging(dataDir);
        await assert.rejects(
            verifyManifest(dir, [], LIMITS),
            (error: unknown) => error instanceof AppError && error.code === "invalid_request",
        );
        await writeFile(join(dir, "index.html"), "");
        await assert.rejects(
            verifyManifest(dir, [{ path: "index.html", size: 0 }], LIMITS),
            (error: unknown) => error instanceof AppError && error.code === "manifest_mismatch",
        );
    });

    it("rejects publications over the file or byte limit", async () => {
        const { dir } = await createStaging(dataDir);
        await writeFile(join(dir, "index.html"), "<html></html>");
        await assert.rejects(
            verifyManifest(dir, [{ path: "index.html", size: 13 }], { ...LIMITS, maxFiles: 0 }),
            AppError,
        );
        await assert.rejects(
            verifyManifest(dir, [{ path: "index.html", size: 13 }], { ...LIMITS, maxPublicationBytes: 5 }),
            AppError,
        );
    });
});

describe("cleanupStaging", () => {
    it("removes only stale staging directories", async () => {
        const stale = join(dataDir, "staging", "aaaaaaaaaaaaaaaa");
        const fresh = join(dataDir, "staging", "bbbbbbbbbbbbbbbb");
        await mkdir(stale);
        await mkdir(fresh);
        const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
        await utimes(stale, old, old);

        const removed = await cleanupStaging(dataDir, 60 * 60 * 1000);
        assert.deepEqual(removed, ["aaaaaaaaaaaaaaaa"]);
    });
});

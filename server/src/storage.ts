import { randomBytes } from "node:crypto";
import { constants, createWriteStream } from "node:fs";
import { access, lstat, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Transform, type Readable, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";

import type { ManifestEntry } from "./contracts.js";
import { AppError, conflict, invalidRequest, notFound, tooLarge } from "./errors.js";

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
const ID_LENGTH = 16;
const ID_PATTERN = /^[a-z2-7]{16}$/;
const MAX_PATH_LENGTH = 1024;
const MAX_PATH_DEPTH = 20;
const MAX_SEGMENT_LENGTH = 255;

export interface PublicationDirs {
    staging: string;
    public: string;
}

export interface UploadLimits {
    maxFiles: number;
    maxFileBytes: number;
    maxPublicationBytes: number;
}

export interface VerifyManifestResult {
    fileCount: number;
    totalBytes: number;
}

function isErrno(error: unknown, code: string): boolean {
    return typeof error === "object" && error !== null &&
        "code" in error && (error as { code?: unknown }).code === code;
}

async function pathExists(path: string): Promise<boolean> {
    try {
        await lstat(path);
        return true;
    } catch (error) {
        if (isErrno(error, "ENOENT")) {
            return false;
        }
        throw error;
    }
}

export async function ensureDataLayout(dataDir: string): Promise<void> {
    await mkdir(join(dataDir, "staging"), { recursive: true });
    await mkdir(join(dataDir, "public"), { recursive: true });
    await access(dataDir, constants.W_OK);
}

export function createPublicationId(): string {
    const bytes = randomBytes(ID_LENGTH);
    let id = "";
    for (const byte of bytes) {
        id += ID_ALPHABET[byte % ID_ALPHABET.length];
    }
    return id;
}

export function isPublicationId(value: string): boolean {
    return ID_PATTERN.test(value);
}

export function publicationDirs(dataDir: string, id: string): PublicationDirs {
    if (!isPublicationId(id)) {
        throw notFound();
    }
    return {
        staging: join(dataDir, "staging", id),
        public: join(dataDir, "public", id),
    };
}

export function publicationPath(id: string): string {
    return `/p/${id}/`;
}

/**
 * Accepts only a POSIX-style relative path that cannot escape the publication directory.
 */
export function validateRelativePath(value: unknown): string {
    if (typeof value !== "string" || value.length === 0) {
        throw invalidRequest("File path must be a non-empty string.");
    }
    if (value.length > MAX_PATH_LENGTH) {
        throw invalidRequest(`File path exceeds ${MAX_PATH_LENGTH} characters.`);
    }
    if (value.startsWith("/") || value.includes("\\") || value.includes("\0")) {
        throw invalidRequest(`Invalid file path: ${JSON.stringify(value)}.`);
    }
    if (/[\u0000-\u001f\u007f]/.test(value)) {
        throw invalidRequest("File path contains control characters.");
    }

    const segments = value.split("/");
    if (segments.length > MAX_PATH_DEPTH) {
        throw invalidRequest(`File path exceeds ${MAX_PATH_DEPTH} segments.`);
    }

    for (const segment of segments) {
        if (segment.length === 0 || segment === "." || segment === "..") {
            throw invalidRequest(`Invalid path segment in ${JSON.stringify(value)}.`);
        }
        if (segment.startsWith(".")) {
            throw invalidRequest(`Hidden path segments are not allowed: ${JSON.stringify(segment)}.`);
        }
        if (segment.length > MAX_SEGMENT_LENGTH) {
            throw invalidRequest(`Path segment exceeds ${MAX_SEGMENT_LENGTH} characters.`);
        }
        if (segment.includes(":")) {
            throw invalidRequest(`Invalid path segment: ${JSON.stringify(segment)}.`);
        }
    }

    return segments.join("/");
}

export function resolveInside(root: string, relativePath: string): string {
    const rootPath = resolve(root);
    const target = resolve(rootPath, ...relativePath.split("/"));
    const difference = relative(rootPath, target);
    if (difference === "" || difference === ".." || difference.startsWith(`..${sep}`) || isAbsolute(difference)) {
        throw invalidRequest("File path escapes the publication directory.");
    }
    return target;
}

export async function createStaging(dataDir: string): Promise<{ id: string; dir: string }> {
    for (let attempt = 0; attempt < 10; attempt++) {
        const id = createPublicationId();
        const dirs = publicationDirs(dataDir, id);
        if (await pathExists(dirs.public)) {
            continue;
        }
        try {
            await mkdir(dirs.staging);
        } catch (error) {
            if (isErrno(error, "EEXIST")) {
                continue;
            }
            throw error;
        }
        return { id, dir: dirs.staging };
    }
    throw new AppError(500, "internal_error", "Unable to allocate a publication id.");
}

async function replaceFile(source: string, target: string): Promise<void> {
    try {
        await rename(source, target);
        return;
    } catch (error) {
        const canReplace = isErrno(error, "EEXIST") || isErrno(error, "EPERM") || isErrno(error, "EACCES");
        if (!canReplace || !(await pathExists(target))) {
            throw error;
        }
        await rm(target, { force: true });
        await rename(source, target);
    }
}

export async function writeUploadedFile(
    stagingDir: string,
    relativePath: string,
    stream: Readable,
    maxBytes: number,
): Promise<number> {
    const normalized = validateRelativePath(relativePath);
    const target = resolveInside(stagingDir, normalized);
    await mkdir(dirname(target), { recursive: true });

    const partPath = `${target}.part-${randomBytes(6).toString("hex")}`;
    let bytes = 0;
    const counter = new Transform({
        transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
            bytes += chunk.length;
            if (bytes > maxBytes) {
                callback(tooLarge(`File exceeds the ${maxBytes} byte limit.`));
                return;
            }
            callback(null, chunk);
        },
    });

    try {
        await pipeline(stream, counter, createWriteStream(partPath, { flags: "wx" }));
        await replaceFile(partPath, target);
        return bytes;
    } catch (error) {
        await rm(partPath, { force: true }).catch(() => undefined);
        throw error;
    }
}

async function walkFiles(root: string, directory: string, files: Map<string, number>): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = join(directory, entry.name);
        const info = await lstat(fullPath);
        if (info.isSymbolicLink()) {
            throw conflict("invalid_publication", "Symbolic links are not allowed in a publication.");
        }
        if (info.isDirectory()) {
            await walkFiles(root, fullPath, files);
            continue;
        }
        if (!info.isFile()) {
            throw conflict("invalid_publication", `Unsupported file type: ${entry.name}.`);
        }
        const relativePath = relative(root, fullPath).split(sep).join("/");
        files.set(relativePath, info.size);
    }
}

export async function collectFiles(root: string): Promise<Map<string, number>> {
    const files = new Map<string, number>();
    try {
        await walkFiles(root, root, files);
    } catch (error) {
        if (isErrno(error, "ENOENT")) {
            throw notFound("Staging publication not found.");
        }
        throw error;
    }
    return files;
}

function bounded<T>(values: T[]): T[] {
    return values.slice(0, 20);
}

export async function verifyManifest(
    stagingDir: string,
    files: ManifestEntry[],
    limits: UploadLimits,
): Promise<VerifyManifestResult> {
    if (!Array.isArray(files) || files.length === 0) {
        throw invalidRequest("files must be a non-empty array.");
    }
    if (files.length > limits.maxFiles) {
        throw tooLarge(`Publication exceeds the ${limits.maxFiles} file limit.`);
    }

    const expected = new Map<string, number>();
    let totalBytes = 0;

    for (const entry of files) {
        if (!entry || typeof entry !== "object") {
            throw invalidRequest("Each manifest entry must be an object.");
        }
        const relativePath = validateRelativePath(entry.path);
        if (expected.has(relativePath)) {
            throw invalidRequest(`Duplicate manifest path: ${relativePath}.`);
        }
        if (!Number.isInteger(entry.size) || entry.size < 0 || entry.size > limits.maxFileBytes) {
            throw invalidRequest(`Invalid size for ${relativePath}.`);
        }
        expected.set(relativePath, entry.size);
        totalBytes += entry.size;
        if (totalBytes > limits.maxPublicationBytes) {
            throw tooLarge(`Publication exceeds the ${limits.maxPublicationBytes} byte limit.`);
        }
    }

    if (!expected.has("index.html")) {
        throw conflict("manifest_mismatch", "Manifest must contain index.html at the publication root.", {
            counts: { missing: 1, extra: 0, sizeMismatch: 0 },
            missing: ["index.html"],
            extra: [],
            sizeMismatch: [],
        });
    }
    if ((expected.get("index.html") ?? 0) === 0) {
        throw conflict("manifest_mismatch", "index.html must not be empty.", {
            counts: { missing: 0, extra: 0, sizeMismatch: 1 },
            missing: [],
            extra: [],
            sizeMismatch: [{ path: "index.html", expected: "non-empty", actual: 0 }],
        });
    }

    const actual = await collectFiles(stagingDir);
    const missing = [...expected.keys()].filter((path) => !actual.has(path));
    const extra = [...actual.keys()].filter((path) => !expected.has(path));
    const sizeMismatch = [...expected.entries()]
        .filter(([path, size]) => actual.has(path) && actual.get(path) !== size)
        .map(([path, size]) => ({ path, expected: size, actual: actual.get(path) }));

    if (missing.length > 0 || extra.length > 0 || sizeMismatch.length > 0) {
        throw conflict("manifest_mismatch", "Uploaded files do not match the manifest.", {
            counts: {
                missing: missing.length,
                extra: extra.length,
                sizeMismatch: sizeMismatch.length,
            },
            missing: bounded(missing),
            extra: bounded(extra),
            sizeMismatch: bounded(sizeMismatch),
        });
    }

    return { fileCount: expected.size, totalBytes };
}

export async function stagingDirForUpload(dataDir: string, id: string): Promise<string> {
    const dirs = publicationDirs(dataDir, id);
    if (await pathExists(dirs.public)) {
        throw conflict("already_committed", "Publication is already committed.");
    }
    let info;
    try {
        info = await stat(dirs.staging);
    } catch (error) {
        if (isErrno(error, "ENOENT")) {
            throw notFound("Staging publication not found.");
        }
        throw error;
    }
    if (!info.isDirectory()) {
        throw notFound("Staging publication not found.");
    }
    return dirs.staging;
}

export async function commitPublication(dataDir: string, id: string): Promise<void> {
    const dirs = publicationDirs(dataDir, id);
    if (await pathExists(dirs.public)) {
        throw conflict("already_committed", "Publication is already committed.");
    }
    try {
        await rename(dirs.staging, dirs.public);
    } catch (error) {
        if (isErrno(error, "ENOENT")) {
            throw notFound("Staging publication not found.");
        }
        if (isErrno(error, "EEXIST") || isErrno(error, "ENOTEMPTY") ||
            ((isErrno(error, "EPERM") || isErrno(error, "EACCES")) && await pathExists(dirs.public))) {
            throw conflict("already_committed", "Publication is already committed.");
        }
        throw error;
    }
}

export async function cleanupStaging(dataDir: string, ttlMs: number, now = Date.now()): Promise<string[]> {
    const root = join(dataDir, "staging");
    let entries;
    try {
        entries = await readdir(root, { withFileTypes: true });
    } catch (error) {
        if (isErrno(error, "ENOENT")) {
            return [];
        }
        throw error;
    }

    const removed: string[] = [];
    for (const entry of entries) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) {
            continue;
        }
        const fullPath = join(root, entry.name);
        const info = await lstat(fullPath).catch(() => undefined);
        if (!info || info.isSymbolicLink() || !info.isDirectory()) {
            continue;
        }
        if (now - info.mtimeMs <= ttlMs) {
            continue;
        }
        await rm(fullPath, { recursive: true, force: true });
        removed.push(entry.name);
    }
    return removed;
}

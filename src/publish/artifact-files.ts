/**
 * Reads the local `temp/export/<folder>` artifact through the SiYuan kernel file APIs.
 */
import { readDir } from "@/api";

import { PublishError, messageOf } from "./errors";
import type { ArtifactFile } from "./types";

const LOG_PREFIX = "[siyuan-plugin-webshare]";

function artifactRoot(folder: string): string {
    const normalized = folder.replace(/^\/+|\/+$/g, "");
    if (!normalized) {
        throw new PublishError("listing", "导出目录为空，无法读取发布产物。");
    }
    return `/temp/export/${normalized}`;
}

function validateName(name: string, parent: string): void {
    if (!name || name === "." || name === ".." || name.includes("/") || name.includes("\\") ||
        /[\u0000-\u001f]/.test(name)) {
        throw new PublishError("listing", `产物包含非法文件或目录名：${JSON.stringify(name)}`, { path: parent });
    }
}

async function walk(folder: string, relativeDir: string, files: ArtifactFile[]): Promise<void> {
    const root = artifactRoot(folder);
    const apiPath = relativeDir ? `${root}/${relativeDir}` : root;
    const response = await readDir(apiPath);
    if (!response.ok || !response.data) {
        throw new PublishError(
            "listing",
            `读取产物目录失败：${apiPath}（code=${response.raw.code} msg=${response.raw.msg}）`,
            { path: relativeDir },
        );
    }

    for (const entry of response.data) {
        validateName(entry.name, relativeDir);
        const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
        if (entry.isSymlink) {
            throw new PublishError("listing", `产物包含符号链接，暂不支持发布：${relativePath}`, { path: relativePath });
        }
        if (entry.isDir) {
            await walk(folder, relativePath, files);
            continue;
        }
        files.push({ relativePath });
    }
}

function siyuanApiToken(): string {
    const token = (window.siyuan as { config?: { api?: { token?: string } } } | undefined)?.config?.api?.token;
    return typeof token === "string" ? token : "";
}

/**
 * Lists every file below the artifact root and verifies that `index.html` exists.
 */
export async function listArtifactFiles(folder: string): Promise<ArtifactFile[]> {
    const files: ArtifactFile[] = [];
    await walk(folder, "", files);
    files.sort((left, right) => left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0);
    if (!files.some((file) => file.relativePath === "index.html")) {
        throw new PublishError("listing", "发布产物缺少根目录 index.html。");
    }
    console.log(`${LOG_PREFIX} artifact listed: files=${files.length} folder=${folder}`);
    return files;
}

/**
 * Reads one artifact file as a Blob. Unlike the template's `getFileBlob`, failures are never
 * converted to `null`; the caller receives a typed error with the exact path and HTTP status.
 */
export async function readArtifactFile(
    folder: string,
    relativePath: string,
    signal?: AbortSignal,
): Promise<Blob> {
    const apiPath = `${artifactRoot(folder)}/${relativePath}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = siyuanApiToken();
    if (token) {
        // SiYuan kernel API authentication is separate from the publish server bearer token.
        headers.Authorization = `Token ${token}`;
    }

    let response: Response;
    try {
        response = await fetch("/api/file/getFile", {
            method: "POST",
            headers,
            body: JSON.stringify({ path: apiPath }),
            signal,
        });
    } catch (error) {
        throw new PublishError("reading", `读取文件失败：${relativePath}（${messageOf(error)}）`, {
            path: relativePath,
            cause: error,
        });
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (response.status === 202 && contentType.includes("application/json")) {
        const payload = await response.json().catch(() => null) as { code?: number; msg?: string } | null;
        throw new PublishError(
            "reading",
            `读取文件失败：${relativePath}（${payload?.msg ?? `HTTP ${response.status}`}）`,
            { path: relativePath, status: response.status },
        );
    }
    if (!response.ok) {
        let detail = response.statusText || `HTTP ${response.status}`;
        try {
            const payload = await response.json() as { msg?: string };
            if (payload.msg) {
                detail = payload.msg;
            }
        } catch {
            // Non-JSON error bodies are reported by status.
        }
        throw new PublishError("reading", `读取文件失败：${relativePath}（${detail}）`, {
            path: relativePath,
            status: response.status,
        });
    }

    return await response.blob();
}

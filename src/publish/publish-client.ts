/**
 * HTTP client for the standalone publish server.
 *
 * The publish token is a bearer credential for our server and is deliberately separate from the
 * SiYuan kernel API token used while reading the local artifact.
 */
import { isAbortError, messageOf, PublishError, type PublishStage } from "./errors";
import type {
    PublishConfig,
    PublishManifestEntry,
    ServerCompleteResponse,
    ServerCreateResponse,
    ServerErrorResponse,
    ServerHealthResponse,
} from "./types";

const JSON_TIMEOUT_MS = 30_000;
const COMPLETE_TIMEOUT_MS = 60_000;
const UPLOAD_TIMEOUT_MS = 5 * 60_000;
const PUBLICATION_ID_PATTERN = /^[a-z2-7]{16}$/;

interface RequestSignal {
    signal: AbortSignal;
    cleanup: () => void;
    timedOut: () => boolean;
}

function requestSignal(parent: AbortSignal | undefined, timeoutMs: number): RequestSignal {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort(new DOMException("Request timed out.", "TimeoutError"));
    }, timeoutMs);
    const onAbort = () => controller.abort(parent?.reason);
    if (parent) {
        if (parent.aborted) {
            controller.abort(parent.reason);
        } else {
            parent.addEventListener("abort", onAbort, { once: true });
        }
    }
    return {
        signal: controller.signal,
        cleanup: () => {
            clearTimeout(timer);
            parent?.removeEventListener("abort", onAbort);
        },
        timedOut: () => timedOut,
    };
}

export function normalizeBaseUrl(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
        throw new PublishError("config", "发布服务器地址为空。");
    }

    let url: URL;
    try {
        url = new URL(trimmed);
    } catch {
        throw new PublishError("config", `无效的发布服务器地址：${trimmed}`);
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new PublishError("config", "发布服务器地址必须使用 http 或 https。");
    }
    if (url.username || url.password) {
        throw new PublishError("config", "发布服务器地址不能包含用户名或密码。");
    }
    if (url.pathname !== "/" || url.search || url.hash) {
        throw new PublishError("config", "发布服务器地址必须是纯 origin，不能包含路径、查询或片段。");
    }

    return url.origin;
}

function parseJson(text: string): unknown {
    if (!text) {
        return undefined;
    }
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}

export class PublishClient {
    readonly baseUrl: string;
    private readonly token: string;
    private readonly signal?: AbortSignal;

    constructor(config: PublishConfig, signal?: AbortSignal) {
        this.baseUrl = normalizeBaseUrl(config.baseUrl);
        this.token = config.token.trim();
        this.signal = signal;
        if (!this.token) {
            throw new PublishError("config", "发布服务器 token 为空。");
        }
    }

    async health(): Promise<ServerHealthResponse> {
        return await this.jsonRequest<ServerHealthResponse>("health", "GET", "/api/health", undefined, JSON_TIMEOUT_MS);
    }

    async createPublication(title: string, docId: string): Promise<ServerCreateResponse> {
        const response = await this.jsonRequest<ServerCreateResponse>(
            "creating",
            "POST",
            "/api/publications",
            { title, docId },
            JSON_TIMEOUT_MS,
        );
        if (!PUBLICATION_ID_PATTERN.test(response.id) || typeof response.path !== "string" ||
            !response.path.startsWith(`/p/${response.id}/`)) {
            throw new PublishError("creating", "服务器返回了无效的发布 id 或路径。");
        }
        return response;
    }

    async uploadFile(id: string, relativePath: string, blob: Blob): Promise<number> {
        const request = requestSignal(this.signal, UPLOAD_TIMEOUT_MS);
        const form = new FormData();
        form.append("file", blob, relativePath.split("/").pop() || "file");

        try {
            const response = await fetch(
                `${this.baseUrl}/api/publications/${encodeURIComponent(id)}/files?path=${encodeURIComponent(relativePath)}`,
                {
                    method: "PUT",
                    // Do not set Content-Type: the browser must add the multipart boundary.
                    headers: { Authorization: `Bearer ${this.token}` },
                    body: form,
                    signal: request.signal,
                },
            );

            if (response.status !== 204) {
                const text = await response.text();
                throw this.httpError("uploading", response, parseJson(text), text, relativePath);
            }
            return blob.size;
        } catch (error) {
            if (error instanceof PublishError) {
                throw error;
            }
            throw this.transportError("uploading", relativePath, error, request);
        } finally {
            request.cleanup();
        }
    }

    async completePublication(id: string, files: PublishManifestEntry[]): Promise<ServerCompleteResponse> {
        return await this.jsonRequest<ServerCompleteResponse>(
            "completing",
            "POST",
            `/api/publications/${encodeURIComponent(id)}/complete`,
            { files },
            COMPLETE_TIMEOUT_MS,
        );
    }

    private async jsonRequest<T>(
        stage: PublishStage,
        method: "GET" | "POST",
        path: string,
        body: unknown,
        timeoutMs: number,
    ): Promise<T> {
        const request = requestSignal(this.signal, timeoutMs);
        let response: Response;
        try {
            response = await fetch(`${this.baseUrl}${path}`, {
                method,
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    ...(body === undefined ? {} : { "Content-Type": "application/json" }),
                },
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: request.signal,
            });
        } catch (error) {
            throw this.transportError(stage, path, error, request);
        } finally {
            request.cleanup();
        }

        const text = await response.text();
        const data = parseJson(text);
        if (!response.ok) {
            throw this.httpError(stage, response, data, text, path);
        }
        if (data === undefined) {
            throw new PublishError(stage, `服务器返回空响应：${path}（HTTP ${response.status}）`, {
                status: response.status,
            });
        }
        return data as T;
    }

    private transportError(stage: PublishStage, path: string, error: unknown, request: RequestSignal): PublishError {
        if (this.signal?.aborted) {
            return new PublishError("canceled", "发布已取消。", { cause: error });
        }
        if (request.timedOut()) {
            return new PublishError(stage, `请求超时：${path}`, { cause: error });
        }
        if (isAbortError(error)) {
            return new PublishError("canceled", "发布已取消。", { cause: error });
        }
        return new PublishError(stage, `无法连接发布服务器：${messageOf(error)}`, { cause: error });
    }

    private httpError(
        stage: PublishStage,
        response: Response,
        data: unknown,
        text: string,
        path?: string,
    ): PublishError {
        const payload = (typeof data === "object" && data !== null ? data : undefined) as ServerErrorResponse | undefined;
        const detail = payload?.message ?? payload?.error ??
            (text ? text.slice(0, 300) : response.statusText) ?? `HTTP ${response.status}`;
        return new PublishError(stage, `服务器返回 HTTP ${response.status}：${detail}`, {
            path,
            status: response.status,
            requestId: payload?.requestId,
        });
    }
}

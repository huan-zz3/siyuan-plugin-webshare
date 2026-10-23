/**
 * 外部摘录服务（Kernel Plugin 示例）归档
 *
 * 原实现分散在 `src/kernel.ts` 与 `src/kernel-capture/`，用于演示 Kernel Plugin
 * 的私有 HTTP handler、外部客户端认证、日记写入、RPC broadcast 和 storage 持久化。
 * 它与「文档公网分享」无关，为保持试用界面干净，已从插件中移除；原始代码整体
 * 注释保留在此，相关文档存放在 `src/examples/kernel-capture-docs/`。
 *
 * 恢复时，取消对应章节注释，恢复 `src/kernel.ts` 中的 CaptureService 接入，
 * 并在 `src/index.ts` 重新注册 `capture-received` 与顶栏菜单入口。
 */
// ===== 原始 src/kernel.ts（含摘录服务接入） =====
/*
import type * as kernel from "siyuan/kernel";
import { CaptureService } from "./kernel-capture/kernel-service";

const STORAGE_FILE = "kernel-sample.json";
const api: kernel.ISiyuan = siyuan;
const captureService = new CaptureService(api);

api.plugin.lifecycle.onload = async () => {
    await api.logger.info(`[${api.plugin.name}] kernel plugin loading`);
    await captureService.start();

    await api.storage.put(STORAGE_FILE, JSON.stringify({
        message: "Hello from the kernel plugin",
        updatedAt: new Date().toISOString(),
    }, null, 2));

    await api.rpc.bind("echo", async (...args) => {
        await api.logger.info(`[${api.plugin.name}] echo called`, args);
        return {
            plugin: api.plugin.name,
            platform: api.plugin.platform,
            args,
        };
    }, "Return the received arguments with kernel plugin metadata.");

    await api.rpc.bind("readSampleStorage", async () => {
        const data = await api.storage.get(STORAGE_FILE);
        return JSON.parse(await data.text());
    }, "Read the sample file stored by the kernel plugin.");
};

api.plugin.lifecycle.onrunning = async () => {
    await api.logger.info(`[${api.plugin.name}] kernel plugin running`);
    await api.rpc.broadcast("notify", ["Kernel plugin is running"]);
};

api.plugin.lifecycle.onunload = async () => {
    await api.logger.info(`[${api.plugin.name}] kernel plugin unloading`);
    await captureService.stop();
    await api.rpc.unbind("echo");
    await api.rpc.unbind("readSampleStorage");
};
*/

// ===== src/kernel-capture/kernel-service.ts =====
/*
import type * as kernel from "siyuan/kernel";
import type {
    AppendBlockResult,
    CaptureBroadcast,
    CaptureRecord,
    CaptureRequest,
    CaptureResult,
    CaptureServiceConfig,
    CaptureServiceSnapshot,
    KernelApiResponse,
} from "./contracts";

const CONFIG_FILE = "capture-service/config.json";
const HISTORY_FILE = "capture-service/history.json";
const MAX_CAPTURE_TEXT_LENGTH = 100_000;
const MAX_HISTORY_LENGTH = 20;

export class CaptureService {
    private readonly startedAt = new Date().toISOString();
    private config: CaptureServiceConfig = { notebookId: "", notebookName: "" };
    private recentCaptures: CaptureRecord[] = [];

    constructor(private readonly api: kernel.ISiyuan) {}

    async start(): Promise<void> {
        this.config = await this.readJson(CONFIG_FILE, this.config);
        this.recentCaptures = await this.readJson(HISTORY_FILE, []);
        this.api.server.private.http.handler = (request) => this.handleHttpRequest(request);
    }

    async stop(): Promise<void> {
        this.api.server.private.http.handler = null;
    }

    private async handleHttpRequest(request: kernel.IServerRequest): Promise<kernel.IHttpResponse> {
        const { method } = request.request;
        const { path } = request.context;

        try {
            if (method === "GET" && path === "/status") {
                return jsonResponse(200, this.snapshot());
            }
            if (method === "GET" && path === "/capture") {
                return jsonResponse(200, this.snapshot());
            }
            if (method === "PUT" && path === "/capture/config") {
                return jsonResponse(200, await this.updateConfig(await readJsonBody(request)));
            }
            if (method === "POST" && path === "/capture") {
                return jsonResponse(200, await this.capture(await readJsonBody(request)));
            }
            return jsonResponse(404, { error: "Capture service route not found" });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await this.api.logger.warn("Capture service request rejected", { method, path, message });
            return jsonResponse(400, { error: message });
        }
    }

    private snapshot(): CaptureServiceSnapshot {
        return {
            status: "running",
            pluginName: this.api.plugin.name,
            platform: this.api.plugin.platform,
            startedAt: this.startedAt,
            config: this.config,
            recentCaptures: this.recentCaptures,
        };
    }

    private async updateConfig(input: unknown): Promise<CaptureServiceConfig> {
        if (!isRecord(input)) {
            throw new Error("Configuration must be a JSON object");
        }

        const notebookId = readOptionalString(input.notebookId);
        const notebookName = readOptionalString(input.notebookName);
        this.config = { notebookId, notebookName };
        await this.api.storage.put(CONFIG_FILE, JSON.stringify(this.config, null, 2));
        return this.config;
    }

    private async capture(input: unknown): Promise<CaptureResult> {
        const request = parseCaptureRequest(input);
        const capturedAt = new Date().toISOString();
        const result: CaptureResult = {
            mode: request.commit ? "committed" : "preview",
            markdown: formatCaptureMarkdown(request),
            capturedAt,
            source: request.source || "External capture",
            title: request.title || "",
        };

        if (request.commit) {
            if (!this.config.notebookId) {
                throw new Error("Choose a target notebook in the Capture Service GUI before writing");
            }

            const dailyNote = await this.callKernelApi<{ id: string }>("/api/filetree/createDailyNote", {
                notebook: this.config.notebookId,
            });
            const appended = await this.callKernelApi<AppendBlockResult[]>("/api/block/appendBlock", {
                dataType: "markdown",
                data: result.markdown,
                parentID: dailyNote.id,
            });
            const blockId = appended[0]?.doOperations?.[0]?.id || "";

            result.documentId = dailyNote.id;
            result.blockId = blockId;
            await this.recordCapture(result);
        }

        const event: CaptureBroadcast = { openUi: request.openUi === true, result };
        await this.api.rpc.broadcast("capture-received", [event]);
        return result;
    }

    private async recordCapture(result: CaptureResult): Promise<void> {
        const record: CaptureRecord = {
            id: result.blockId || `${Date.now()}`,
            capturedAt: result.capturedAt,
            source: result.source,
            title: result.title,
            markdown: result.markdown,
            notebookId: this.config.notebookId,
            documentId: result.documentId || "",
            blockId: result.blockId || "",
        };

        this.recentCaptures = [record, ...this.recentCaptures].slice(0, MAX_HISTORY_LENGTH);
        await this.api.storage.put(HISTORY_FILE, JSON.stringify(this.recentCaptures, null, 2));
    }

    private async callKernelApi<T>(path: `/${string}`, body: unknown): Promise<T> {
        const response = await this.api.client.fetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            throw new Error(`SiYuan API ${path} returned HTTP ${response.status}`);
        }

        const payload = await response.json() as KernelApiResponse<T>;
        if (payload.code !== 0) {
            throw new Error(payload.msg || `SiYuan API ${path} failed with code ${payload.code}`);
        }
        return payload.data;
    }

    private async readJson<T>(path: string, fallback: T): Promise<T> {
        try {
            const data = await this.api.storage.get(path);
            return await data.json() as T;
        } catch {
            return fallback;
        }
    }
}

function parseCaptureRequest(input: unknown): CaptureRequest {
    if (!isRecord(input)) {
        throw new Error("Capture request must be a JSON object");
    }

    const text = readOptionalString(input.text).trim();
    if (!text) {
        throw new Error("Capture text is required");
    }
    if (text.length > MAX_CAPTURE_TEXT_LENGTH) {
        throw new Error(`Capture text exceeds ${MAX_CAPTURE_TEXT_LENGTH} characters`);
    }

    return {
        text,
        source: readOptionalString(input.source).trim(),
        title: readOptionalString(input.title).trim(),
        url: readOptionalString(input.url).trim(),
        commit: input.commit === true,
        openUi: input.openUi === true,
    };
}

function formatCaptureMarkdown(request: CaptureRequest): string {
    const quote = request.text
        .split(/\r?\n/)
        .map((line) => `> ${line}`)
        .join("\n");
    const attribution = [
        request.title && request.url ? `[${request.title}](${request.url})` : request.title,
        request.source,
    ].filter(Boolean).join(" · ");

    return attribution ? `${quote}\n\n— ${attribution}` : quote;
}

async function readJsonBody(request: kernel.IServerRequest): Promise<unknown> {
    const data = request.request.body.data;
    if (!data) {
        throw new Error("A JSON request body is required");
    }
    return data.json();
}

function jsonResponse(statusCode: number, data: unknown): kernel.IHttpResponse {
    return {
        statusCode,
        body: {
            data: {
                type: "JSON",
                data,
            },
        },
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown): string {
    if (value === undefined || value === null) {
        return "";
    }
    if (typeof value !== "string") {
        throw new Error("Capture fields must be strings");
    }
    return value;
}
*/

// ===== src/kernel-capture/contracts.ts =====
/*
export interface CaptureServiceConfig {
    notebookId: string;
    notebookName: string;
}

export interface CaptureRequest {
    text: string;
    source?: string;
    title?: string;
    url?: string;
    commit?: boolean;
    openUi?: boolean;
}

export interface CaptureRecord {
    id: string;
    capturedAt: string;
    source: string;
    title: string;
    markdown: string;
    notebookId: string;
    documentId: string;
    blockId: string;
}

export interface CaptureResult {
    mode: "preview" | "committed";
    markdown: string;
    capturedAt: string;
    source: string;
    title: string;
    documentId?: string;
    blockId?: string;
}

export interface CaptureServiceSnapshot {
    status: "running";
    pluginName: string;
    platform: string;
    startedAt: string;
    config: CaptureServiceConfig;
    recentCaptures: CaptureRecord[];
}

export interface CaptureBroadcast {
    openUi: boolean;
    result: CaptureResult;
}

export interface KernelApiResponse<T> {
    code: number;
    msg: string;
    data: T;
}

export interface AppendBlockResult {
    doOperations?: Array<{ id?: string }>;
}
*/

// ===== src/kernel-capture/frontend-client.ts =====
/*
import type {
    CaptureRequest,
    CaptureResult,
    CaptureServiceConfig,
    CaptureServiceSnapshot,
} from "./contracts";

export class CaptureServiceClient {
    private readonly baseUrl: string;

    constructor(pluginName: string) {
        this.baseUrl = `/plugin/private/${pluginName}`;
    }

    getSnapshot(): Promise<CaptureServiceSnapshot> {
        return this.request("/capture");
    }

    updateConfig(config: CaptureServiceConfig): Promise<CaptureServiceConfig> {
        return this.request("/capture/config", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(config),
        });
    }

    capture(request: CaptureRequest): Promise<CaptureResult> {
        return this.request("/capture", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
        });
    }

    private async request<T>(path: string, init?: RequestInit): Promise<T> {
        const response = await fetch(`${this.baseUrl}${path}`, init);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data?.error || `Capture service returned HTTP ${response.status}`);
        }
        return data as T;
    }
}
*/

// ===== src/kernel-capture/integration-command.ts =====
/*
export interface IntegrationCommandContext {
    os: string;
    serverAddrs: string[];
    currentOrigin: string;
    token: string;
}

export interface IntegrationCommand {
    shell: "PowerShell" | "curl";
    serverAddress: string;
    display: string;
    runnable: string;
}

export function createIntegrationCommand(
    pluginName: string,
    context: IntegrationCommandContext,
): IntegrationCommand {
    const serverAddress = chooseServerAddress(context.serverAddrs, context.currentOrigin);
    const endpoint = `${serverAddress}/plugin/private/${pluginName}/capture`;
    const tokenPlaceholder = "<SIYUAN_API_TOKEN>";

    if (context.os === "windows") {
        return {
            shell: "PowerShell",
            serverAddress,
            display: createPowerShellCommand(endpoint, tokenPlaceholder),
            runnable: createPowerShellCommand(endpoint, context.token),
        };
    }

    return {
        shell: "curl",
        serverAddress,
        display: createCurlCommand(endpoint, tokenPlaceholder),
        runnable: createCurlCommand(endpoint, context.token),
    };
}

function chooseServerAddress(serverAddrs: string[], currentOrigin: string): string {
    const localHttpAddress = serverAddrs.find((address) => /^http:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(address));
    if (localHttpAddress) {
        return localHttpAddress.replace(/\/$/, "");
    }

    const localAddress = serverAddrs.find((address) => /:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(address));
    const fallback = localAddress
        || (/^https?:\/\//.test(currentOrigin) ? currentOrigin : "")
        || serverAddrs[0]
        || "http://127.0.0.1:6806";
    return fallback.replace(/\/$/, "");
}

function createPowerShellCommand(endpoint: string, token: string): string {
    const certificateOption = endpoint.startsWith("https://") ? " -SkipCertificateCheck" : "";
    return `$headers = @{ Authorization = "Token ${escapePowerShell(token)}" }
$body = @{
    text = "A captured idea"
    source = "PowerShell Demo"
    commit = $true
    openUi = $true
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "${escapePowerShell(endpoint)}" -Headers $headers -ContentType "application/json" -Body $body${certificateOption}`;
}

function createCurlCommand(endpoint: string, token: string): string {
    return `curl -X POST \\
  -H 'Authorization: Token ${escapeShellSingleQuoted(token)}' \\
  -H 'Content-Type: application/json' \\
  -d '{"text":"A captured idea","source":"CLI Demo","commit":true,"openUi":true}' \\
  '${escapeShellSingleQuoted(endpoint)}'`;
}

function escapePowerShell(value: string): string {
    return value.replace(/`/g, "``").replace(/"/g, "`\"");
}

function escapeShellSingleQuoted(value: string): string {
    return value.replace(/'/g, `'"'"'`);
}
*/

// ===== src/kernel-capture/capture-console.svelte =====
/*
<script lang="ts">
    import { onMount } from "svelte";
    import { lsNotebooks } from "../api";
    import { CaptureServiceClient } from "./frontend-client";
    import { createIntegrationCommand, type IntegrationCommandContext } from "./integration-command";
    import type { CaptureResult, CaptureServiceSnapshot } from "./contracts";

    interface Props {
        pluginName: string;
        labels: Record<string, string>;
        initialResult?: CaptureResult;
    }

    let { pluginName, labels, initialResult }: Props = $props();
    const client = $derived(new CaptureServiceClient(pluginName));
    const panelOpenedAt = new Date().toISOString();

    let snapshot: CaptureServiceSnapshot | null = $state(null);
    let notebooks: Notebook[] = $state([]);
    let selectedNotebookId = $state("");
    let text = $state("");
    let source = $state("CLI Demo");
    let title = $state("");
    let url = $state("");
    let result: CaptureResult | null = $state(null);
    let error = $state("");
    let busy = $state(false);
    let copiedCommand: "template" | "runnable" | null = $state(null);

    const endpoint = $derived(`/plugin/private/${pluginName}/capture`);
    const integrationCommand = $derived(createIntegrationCommand(pluginName, readIntegrationContext()));

    onMount(() => {
        result = initialResult || null;
        void refresh();
    });

    export async function refresh(): Promise<void> {
        error = "";
        try {
            const [serviceSnapshot, notebookResponse] = await Promise.all([
                client.getSnapshot(),
                lsNotebooks(),
            ]);
            snapshot = serviceSnapshot;
            notebooks = (notebookResponse.data?.notebooks || []).filter((notebook) => !notebook.closed);
            selectedNotebookId = serviceSnapshot.config.notebookId;
        } catch (reason) {
            error = messageFrom(reason);
        }
    }

    export function showCapture(captureResult: CaptureResult): void {
        result = captureResult;
        void refresh();
    }

    async function saveNotebook(): Promise<void> {
        const notebook = notebooks.find((item) => item.id === selectedNotebookId);
        if (!notebook) {
            error = labels.chooseNotebook;
            return;
        }

        await run(async () => {
            await client.updateConfig({ notebookId: notebook.id, notebookName: notebook.name });
            await refresh();
        });
    }

    async function submit(commit: boolean): Promise<void> {
        await run(async () => {
            result = await client.capture({ text, source, title, url, commit });
            if (commit) {
                text = "";
                await refresh();
            }
        });
    }

    async function copyCommand(kind: "template" | "runnable"): Promise<void> {
        const command = kind === "runnable"
            ? createIntegrationCommand(pluginName, readIntegrationContext(window.siyuan.config.api.token)).runnable
            : integrationCommand.display;
        await navigator.clipboard.writeText(command);
        copiedCommand = kind;
        window.setTimeout(() => copiedCommand = null, 1500);
    }

    async function run(operation: () => Promise<void>): Promise<void> {
        busy = true;
        error = "";
        try {
            await operation();
        } catch (reason) {
            error = messageFrom(reason);
        } finally {
            busy = false;
        }
    }

    function readIntegrationContext(token = ""): IntegrationCommandContext {
        return {
            os: window.siyuan.config.system.os,
            serverAddrs: window.siyuan.config.serverAddrs || [],
            currentOrigin: window.location.origin,
            token,
        };
    }

    function messageFrom(reason: unknown): string {
        return reason instanceof Error ? reason.message : String(reason);
    }
</script>

<div class="capture-console b3-dialog__content">
    <section class="intro">
        <div>
            <h2>{labels.title}</h2>
            <p>{labels.intro}</p>
        </div>
        <span class:running={snapshot?.status === "running"} class="service-status">
            {snapshot?.status === "running" ? labels.running : labels.connecting}
        </span>
    </section>

    <div class="flow" aria-label={labels.flowLabel}>
        <span>{labels.externalClient}</span><b>→</b><span>{labels.kernelService}</span><b>→</b><span>{labels.dailyNote}</span>
    </div>

    <section class="card lifetime">
        <div>
            <h3>{labels.serviceLifetime}</h3>
            <p>{labels.serviceLifetimeHelp}</p>
        </div>
        <dl>
            <div><dt>{labels.kernelStarted}</dt><dd>{snapshot ? new Date(snapshot.startedAt).toLocaleString() : labels.connecting}</dd></div>
            <div><dt>{labels.panelOpened}</dt><dd>{new Date(panelOpenedAt).toLocaleString()}</dd></div>
        </dl>
    </section>

    {#if error}
        <div class="error">{error}</div>
    {/if}

    <section class="card">
        <h3>{labels.targetNotebook}</h3>
        <p>{labels.targetNotebookHelp}</p>
        <div class="row">
            <select class="b3-select fn__flex-1" bind:value={selectedNotebookId} disabled={busy}>
                <option value="">{labels.chooseNotebook}</option>
                {#each notebooks as notebook (notebook.id)}
                    <option value={notebook.id}>{notebook.name}</option>
                {/each}
            </select>
            <button class="b3-button" onclick={saveNotebook} disabled={busy || !selectedNotebookId}>{labels.saveTarget}</button>
        </div>
        {#if snapshot?.config.notebookName}
            <small>{labels.currentTarget}: {snapshot.config.notebookName}</small>
        {/if}
    </section>

    <section class="card">
        <h3>{labels.testCapture}</h3>
        <div class="fields">
            <label>{labels.source}<input class="b3-text-field" bind:value={source} /></label>
            <label>{labels.captureTitle}<input class="b3-text-field" bind:value={title} /></label>
            <label>{labels.url}<input class="b3-text-field" bind:value={url} /></label>
            <label class="wide">{labels.text}<textarea class="b3-text-field" bind:value={text} placeholder={labels.textPlaceholder}></textarea></label>
        </div>
        <div class="actions">
            <button class="b3-button b3-button--outline" onclick={() => submit(false)} disabled={busy || !text.trim()}>{labels.preview}</button>
            <button class="b3-button b3-button--text" onclick={() => submit(true)} disabled={busy || !text.trim() || !snapshot?.config.notebookId}>{labels.writeDailyNote}</button>
        </div>
    </section>

    {#if result}
        <section class="card result">
            <h3>{result.mode === "committed" ? labels.written : labels.previewResult}</h3>
            <pre>{result.markdown}</pre>
            {#if result.documentId}
                <small>{labels.documentId}: {result.documentId}{result.blockId ? ` · ${labels.blockId}: ${result.blockId}` : ""}</small>
            {/if}
        </section>
    {/if}

    <section class="card separation-demo">
        <h3>{labels.separationTitle}</h3>
        <p>{labels.separationHelp}</p>
        <ol>
            <li>{labels.separationStep1}</li>
            <li>{labels.separationStep2}</li>
            <li>{labels.separationStep3}</li>
        </ol>
        <div class="runtime-details">
            <span>{labels.detectedShell}: <strong>{integrationCommand.shell}</strong></span>
            <span>{labels.serverAddress}: <code>{integrationCommand.serverAddress}</code></span>
        </div>
        <code>{endpoint}</code>
        <div class="code-block">
            <pre>{integrationCommand.display}</pre>
        </div>
        <div class="actions">
            <button class="b3-button b3-button--outline" onclick={() => copyCommand("template")}>{copiedCommand === "template" ? labels.copied : labels.copyTemplate}</button>
            <button class="b3-button b3-button--text" onclick={() => copyCommand("runnable")} disabled={!snapshot?.config.notebookId}>{copiedCommand === "runnable" ? labels.copied : labels.copyRunnable}</button>
        </div>
        <p class="warning">{labels.tokenWarning}</p>
    </section>

    <section class="card">
        <h3>{labels.recentCaptures}</h3>
        {#if snapshot?.recentCaptures.length}
            <ul class="history">
                {#each snapshot.recentCaptures as capture (capture.id)}
                    <li><time>{new Date(capture.capturedAt).toLocaleString()}</time><strong>{capture.source}</strong><span>{capture.title || capture.markdown.split("\n")[0]}</span></li>
                {/each}
            </ul>
        {:else}
            <p>{labels.noCaptures}</p>
        {/if}
    </section>

    <footer>
        {labels.advancedIntro}
        <a href="https://github.com/siyuan-note/plugin-sample/tree/v0.5.0" target="_blank" rel="noreferrer">plugin-sample</a>
    </footer>
</div>

<style>
    .capture-console { display: grid; gap: 16px; overflow: auto; max-height: 78vh; }
    .intro { display: flex; align-items: start; justify-content: space-between; gap: 16px; }
    h2, h3, p { margin: 0; }
    h2 { margin-bottom: 6px; }
    h3 { margin-bottom: 8px; font-size: 15px; }
    .service-status { flex: none; padding: 4px 10px; border-radius: 999px; background: var(--b3-theme-surface-lighter); }
    .service-status.running { color: var(--b3-card-success-color); background: var(--b3-card-success-background); }
    .flow { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 14px; border-radius: var(--b3-border-radius); background: var(--b3-theme-surface); }
    .flow span { padding: 6px 10px; border: 1px solid var(--b3-border-color); border-radius: var(--b3-border-radius); }
    .card { display: grid; gap: 10px; padding: 16px; border: 1px solid var(--b3-border-color); border-radius: var(--b3-border-radius); }
    .row, .actions, .runtime-details { display: flex; align-items: center; gap: 8px; }
    .lifetime { grid-template-columns: minmax(0, 1fr) auto; }
    dl { display: grid; gap: 6px; margin: 0; }
    dl div { display: grid; grid-template-columns: auto auto; gap: 10px; }
    dt { color: var(--b3-theme-on-surface-light); }
    dd { margin: 0; }
    .separation-demo ol { display: grid; gap: 6px; margin: 0; padding-left: 22px; }
    .runtime-details { flex-wrap: wrap; justify-content: space-between; }
    .fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    label { display: grid; gap: 5px; color: var(--b3-theme-on-surface); }
    label.wide { grid-column: 1 / -1; }
    textarea { min-height: 110px; resize: vertical; }
    .actions { justify-content: flex-end; }
    .error { padding: 10px 12px; color: var(--b3-card-error-color); background: var(--b3-card-error-background); border-radius: var(--b3-border-radius); }
    pre { margin: 0; padding: 12px; overflow: auto; white-space: pre-wrap; background: var(--b3-theme-surface); border-radius: var(--b3-border-radius); }
    code { overflow-wrap: anywhere; }
    .code-block { position: relative; }
    .warning { color: var(--b3-theme-error); }
    .history { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
    .history li { display: grid; grid-template-columns: auto auto 1fr; gap: 10px; align-items: baseline; }
    .history time { color: var(--b3-theme-on-surface-light); font-size: 12px; }
    .history span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    footer { padding-bottom: 8px; color: var(--b3-theme-on-surface-light); }
    footer a { margin-left: 4px; }
    @media (max-width: 700px) {
        .intro, .row, .flow, .runtime-details { align-items: stretch; flex-direction: column; }
        .lifetime { grid-template-columns: 1fr; }
        .flow b { display: none; }
        .fields { grid-template-columns: 1fr; }
        .history li { grid-template-columns: 1fr; gap: 2px; }
    }
</style>
*/

// ===== src/index.ts 中与摘录服务相关的前端代码 =====
/*
import CaptureConsole from "@/kernel-capture/capture-console.svelte";
import type { CaptureBroadcast, CaptureResult } from "@/kernel-capture/contracts";

interface CaptureConsoleHandle {
    showCapture?: (result: CaptureResult) => void;
}

    private captureDialog?: ReturnType<typeof svelteDialog>;

        this.kernel.rpc.bind("capture-received", this.onCaptureReceived);

        this.captureDialog?.close();
        this.captureDialog = undefined;
        this.kernel.rpc.unbind("capture-received", this.onCaptureReceived);

    private readonly onCaptureReceived = (event: CaptureBroadcast) => {
        if (this.captureDialog) {
            (this.captureDialog.component as CaptureConsoleHandle).showCapture?.(event.result);
            return;
        }

        if (event.openUi && document.visibilityState === "visible") {
            this.openCaptureConsole(event.result);
        }
    };

    private openCaptureConsole(initialResult?: CaptureResult) {
        const labels = this.i18n.kernelCapture as unknown as Record<string, string>;
        if (this.captureDialog) {
            if (initialResult) {
                (this.captureDialog.component as CaptureConsoleHandle).showCapture?.(initialResult);
            }
            return;
        }

        this.captureDialog = svelteDialog({
            title: labels.title,
            width: this.isMobile ? "96vw" : "860px",
            component: CaptureConsole,
            props: {
                pluginName: this.name,
                labels,
                initialResult,
            },
            callback: () => {
                this.captureDialog = undefined;
            },
        });
    }

        const captureLabels = this.i18n.kernelCapture as unknown as Record<string, string>;

        menu.addSeparator();
        menu.addItem({
            icon: "iconInbox",
            label: captureLabels.menu,
            click: () => this.openCaptureConsole(),
        });
        menu.addSeparator();
*/

// ===== i18n kernelCapture 文案（en / zh-CN） =====
/*
    "kernelCapture": {
        "menu": "Kernel Plugin Example: External Capture Service",
        "title": "External Capture Service",
        "intro": "A concrete Kernel Plugin example: trusted external tools send a capture request, the kernel-owned service applies your routing rules, and SiYuan writes the result to today's Daily Note.",
        "running": "● Kernel running",
        "connecting": "Connecting…",
        "flowLabel": "Capture request flow",
        "externalClient": "CLI / Reader App",
        "kernelService": "Kernel service",
        "dailyNote": "Daily Note",
        "serviceLifetime": "The service does not belong to this panel",
        "serviceLifetimeHelp": "The Kernel service starts with the SiYuan kernel. This Svelte panel connects later and can close without stopping the service.",
        "kernelStarted": "Kernel service started",
        "panelOpened": "This panel opened",
        "targetNotebook": "Target notebook",
        "targetNotebookHelp": "The Kernel service owns this routing configuration. Preview has no side effects; writing requires an explicit action.",
        "chooseNotebook": "Choose an open notebook",
        "saveTarget": "Save target",
        "currentTarget": "Current target",
        "testCapture": "Test the complete flow",
        "source": "Source",
        "captureTitle": "Title",
        "url": "Source URL",
        "text": "Captured text",
        "textPlaceholder": "Paste a quote or idea…",
        "preview": "Preview Markdown",
        "writeDailyNote": "Write to today's Daily Note",
        "written": "Written by the Kernel service",
        "previewResult": "Preview — nothing was written",
        "documentId": "Daily Note",
        "blockId": "New block",
        "separationTitle": "Prove that the service runs without the UI",
        "separationHelp": "Run the generated command while this panel is closed. The Kernel service receives and writes the capture, then its broadcast asks each visible frontend to open this panel again.",
        "separationStep1": "Save a target notebook, then copy the runnable command.",
        "separationStep2": "Close this panel and run the command in your terminal.",
        "separationStep3": "The Kernel handles the request without this panel. The openUi field then asks each visible frontend to open the panel with the result.",
        "detectedShell": "Detected command",
        "serverAddress": "Current Kernel server",
        "copyTemplate": "Copy redacted template",
        "copyRunnable": "Copy runnable command with token",
        "copied": "Copied",
        "tokenWarning": "The SiYuan API token is an administrator credential, not a capture-only token. Keep it in a trusted local credential store and do not expose this endpoint directly to the Internet.",
        "recentCaptures": "Recent committed captures",
        "noCaptures": "No committed captures yet.",
        "advancedIntro": "For Agent capabilities, RPC batch, WebSocket, SSE, storage watchers, and complete protocol examples, see the official"
    }

    "kernelCapture": {
        "menu": "Kernel Plugin 示例：外部摘录服务",
        "title": "外部摘录服务",
        "intro": "这是一个具体的 Kernel Plugin 案例：可信外部工具发送摘录请求，由 Kernel 服务统一应用归档规则，再写入今天的思源日记。",
        "running": "● Kernel 运行中",
        "connecting": "正在连接…",
        "flowLabel": "摘录请求流程",
        "externalClient": "CLI / 阅读 App",
        "kernelService": "Kernel 服务",
        "dailyNote": "今天的日记",
        "serviceLifetime": "服务不属于这个面板",
        "serviceLifetimeHelp": "Kernel 服务随思源 Kernel 启动。这个 Svelte 面板稍后才连接到服务；关闭面板不会停止服务。",
        "kernelStarted": "Kernel 服务启动时间",
        "panelOpened": "本面板打开时间",
        "targetNotebook": "目标笔记本",
        "targetNotebookHelp": "归档目标由 Kernel 服务统一管理。预览不会产生副作用，真实写入必须由用户明确触发。",
        "chooseNotebook": "选择一个已打开的笔记本",
        "saveTarget": "保存目标",
        "currentTarget": "当前目标",
        "testCapture": "测试完整链路",
        "source": "来源",
        "captureTitle": "标题",
        "url": "来源网址",
        "text": "摘录内容",
        "textPlaceholder": "粘贴一段摘录或想法……",
        "preview": "预览 Markdown",
        "writeDailyNote": "写入今天的日记",
        "written": "Kernel 服务已写入",
        "previewResult": "预览——尚未写入任何内容",
        "documentId": "日记文档",
        "blockId": "新增块",
        "separationTitle": "验证服务脱离 UI 仍然运行",
        "separationHelp": "关闭本面板后运行生成的命令。Kernel 服务独立接收并写入摘录，然后通过 broadcast 请求可见前端重新打开本面板。",
        "separationStep1": "保存目标笔记本，然后复制可运行命令。",
        "separationStep2": "关闭本面板，在终端中运行该命令。",
        "separationStep3": "Kernel 在没有本面板的情况下处理请求；openUi 字段随后请求每个可见 frontend 带着结果重新打开面板。",
        "detectedShell": "检测到的命令",
        "serverAddress": "当前 Kernel server",
        "copyTemplate": "复制脱敏模板",
        "copyRunnable": "复制包含 token 的可运行命令",
        "copied": "已复制",
        "tokenWarning": "思源 API token 是管理员凭据，并不是只能摘录的低权限 token。请将其保存在可信的本机凭据存储中，不要把该端点直接暴露到互联网。",
        "recentCaptures": "最近真实写入的摘录",
        "noCaptures": "尚未写入摘录。",
        "advancedIntro": "Agent capability、RPC batch、WebSocket、SSE、storage watcher 及完整协议案例，请查看官方"
    }
*/

export {};


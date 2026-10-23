<script lang="ts">
    import { onMount } from "svelte";

    import { PublishError } from "./errors";
    import { publishDocument } from "./publisher";
    import type { PublishConfig, PublishPhase, PublishResult } from "./types";

    interface Props {
        labels: Record<string, string>;
        config: PublishConfig;
        documentId: string;
        signal: AbortSignal;
    }

    let { labels, config, documentId, signal }: Props = $props();

    let phase = $state<PublishPhase>("exporting");
    let uploadedFiles = $state(0);
    let totalFiles = $state(0);
    let uploadedBytes = $state(0);
    let result = $state<PublishResult | null>(null);
    let error = $state<PublishError | null>(null);
    let copied = $state(false);
    let copyError = $state("");

    const percent = $derived(totalFiles > 0 ? Math.min(100, Math.round((uploadedFiles / totalFiles) * 100)) : 0);

    function phaseText(value: string): string {
        return labels[value] ?? value;
    }

    function formatBytes(bytes: number): string {
        if (!Number.isFinite(bytes) || bytes <= 0) {
            return "0 B";
        }
        const units = ["B", "KB", "MB", "GB"];
        let value = bytes;
        let unit = 0;
        while (value >= 1024 && unit < units.length - 1) {
            value /= 1024;
            unit += 1;
        }
        return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
    }

    async function copyUrl(): Promise<void> {
        if (!result) {
            return;
        }
        copyError = "";
        try {
            await navigator.clipboard.writeText(result.url);
            copied = true;
        } catch (reason) {
            copied = false;
            copyError = reason instanceof Error ? reason.message : String(reason);
        }
    }

    onMount(() => {
        let active = true;
        void publishDocument({
            documentId,
            config,
            signal,
            onProgress: (progress) => {
                if (!active) {
                    return;
                }
                phase = progress.phase;
                uploadedFiles = progress.uploadedFiles;
                totalFiles = progress.totalFiles;
                uploadedBytes = progress.uploadedBytes;
            },
        }).then((value) => {
            if (!active) {
                return;
            }
            result = value;
            phase = "done";
        }).catch((reason) => {
            if (!active) {
                return;
            }
            error = reason instanceof PublishError
                ? reason
                : new PublishError("exporting", reason instanceof Error ? reason.message : String(reason));
        });
        return () => {
            active = false;
        };
    });
</script>

<div class="siyuan-publisher-publish">
    {#if result}
        <div class="siyuan-publisher-publish__title">{labels.success}</div>
        <div class="b3-label">{labels.urlLabel}</div>
        <input
            class="b3-text-field fn__block siyuan-publisher-publish__url"
            readonly
            value={result.url}
            onclick={(event) => (event.currentTarget as HTMLInputElement).select()}
        />
        <div class="siyuan-publisher-publish__actions">
            <button class="b3-button b3-button--text" onclick={copyUrl}>
                {copied ? labels.copied : labels.copy}
            </button>
        </div>
        {#if copyError}
            <div class="siyuan-publisher-publish__error">{labels.copyFailed}: {copyError}</div>
        {/if}
        <div class="siyuan-publisher-publish__meta">
            {labels.fileCount}: {result.fileCount} · {labels.totalBytes}: {formatBytes(result.totalBytes)}
        </div>
    {:else if error}
        <div class="siyuan-publisher-publish__title">{labels.failed}</div>
        <div class="siyuan-publisher-publish__meta">{labels.phaseLabel}: {phaseText(error.stage)}</div>
        {#if error.path}
            <div class="siyuan-publisher-publish__meta">{labels.fileLabel}: {error.path}</div>
        {/if}
        {#if error.status}
            <div class="siyuan-publisher-publish__meta">{labels.statusLabel}: {error.status}</div>
        {/if}
        {#if error.requestId}
            <div class="siyuan-publisher-publish__meta">{labels.requestIdLabel}: {error.requestId}</div>
        {/if}
        <div class="siyuan-publisher-publish__error">{error.message}</div>
    {:else}
        <div class="siyuan-publisher-publish__title">{phaseText(phase)}</div>
        {#if phase === "uploading"}
            <div class="siyuan-publisher-publish__meta">
                {uploadedFiles}/{totalFiles} · {formatBytes(uploadedBytes)}
            </div>
            <div class="siyuan-publisher-publish__progress">
                <div style={`width: ${percent}%`}></div>
            </div>
        {/if}
        <div class="siyuan-publisher-publish__hint">{labels.closeHint}</div>
    {/if}
</div>

<style>
    .siyuan-publisher-publish {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 4px 2px;
    }

    .siyuan-publisher-publish__title {
        font-weight: 600;
    }

    .siyuan-publisher-publish__meta,
    .siyuan-publisher-publish__hint {
        color: var(--b3-theme-on-surface, var(--b3-theme-on-background));
        font-size: 12px;
    }

    .siyuan-publisher-publish__error {
        color: var(--b3-theme-error, #d23f31);
        word-break: break-word;
    }

    .siyuan-publisher-publish__actions {
        display: flex;
        gap: 8px;
    }

    .siyuan-publisher-publish__progress {
        height: 6px;
        overflow: hidden;
        border-radius: 3px;
        background: var(--b3-theme-surface);
    }

    .siyuan-publisher-publish__progress > div {
        height: 100%;
        background: var(--b3-theme-primary);
        transition: width 0.2s ease;
    }
</style>

/**
 * Orchestrates one publish: export, enumerate, create, upload, commit.
 */
import { exportDocumentAsArtifact } from "./exporter";
import { listArtifactFiles, readArtifactFile } from "./artifact-files";
import { asPublishError, PublishError } from "./errors";
import { PublishClient } from "./publish-client";
import type {
    ExportArtifact,
    PublishConfig,
    PublishManifestEntry,
    PublishPhase,
    PublishProgress,
    PublishResult,
} from "./types";

const LOG_PREFIX = "[siyuan-plugin-webshare]";
const UPLOAD_CONCURRENCY = 4;

export interface PublishDocumentRequest {
    documentId: string;
    config: PublishConfig;
    signal?: AbortSignal;
    onProgress?: (progress: PublishProgress) => void;
}

function canceledError(): PublishError {
    return new PublishError("canceled", "发布已取消。");
}

export async function publishDocument(request: PublishDocumentRequest): Promise<PublishResult> {
    const { documentId, config, signal, onProgress } = request;
    const controller = new AbortController();
    const relayAbort = () => controller.abort(signal?.reason);
    if (signal) {
        if (signal.aborted) {
            controller.abort(signal.reason);
        } else {
            signal.addEventListener("abort", relayAbort, { once: true });
        }
    }

    let totalFiles = 0;
    let uploadedFiles = 0;
    let uploadedBytes = 0;

    const report = (phase: PublishPhase): void => {
        try {
            onProgress?.({ phase, uploadedFiles, totalFiles, uploadedBytes });
        } catch (error) {
            console.error(`${LOG_PREFIX} publish progress callback failed`, error);
        }
    };

    try {
        const client = new PublishClient(config, controller.signal);
        console.log(`${LOG_PREFIX} publish started for document ${documentId} server ${client.baseUrl}`);

        report("exporting");
        let artifact: ExportArtifact;
        try {
            artifact = await exportDocumentAsArtifact(documentId);
        } catch (error) {
            throw asPublishError("exporting", error);
        }
        if (controller.signal.aborted) {
            throw canceledError();
        }

        report("listing");
        const files = await listArtifactFiles(artifact.folder);
        totalFiles = files.length;
        report("listing");

        report("creating");
        const created = await client.createPublication(artifact.name, documentId);
        console.log(`${LOG_PREFIX} publish created id=${created.id} files=${totalFiles}`);

        report("uploading");
        const manifest: PublishManifestEntry[] = new Array(files.length);
        let nextIndex = 0;
        let firstError: unknown;

        const worker = async (): Promise<void> => {
            while (true) {
                if (firstError || controller.signal.aborted) {
                    return;
                }
                const index = nextIndex++;
                if (index >= files.length) {
                    return;
                }
                const file = files[index];
                try {
                    const blob = await readArtifactFile(artifact.folder, file.relativePath, controller.signal);
                    const size = await client.uploadFile(created.id, file.relativePath, blob);
                    manifest[index] = { path: file.relativePath, size };
                    uploadedFiles += 1;
                    uploadedBytes += size;
                    report("uploading");
                    if (uploadedFiles === 1 || uploadedFiles % 50 === 0 || uploadedFiles === totalFiles) {
                        console.log(`${LOG_PREFIX} uploaded ${uploadedFiles}/${totalFiles} files, ${uploadedBytes} bytes`);
                    }
                } catch (error) {
                    if (!firstError) {
                        firstError = asPublishError("uploading", error, file.relativePath);
                        controller.abort();
                    }
                    return;
                }
            }
        };

        const workerCount = Math.min(UPLOAD_CONCURRENCY, files.length);
        await Promise.all(Array.from({ length: workerCount }, () => worker()));

        if (firstError) {
            throw firstError;
        }
        if (controller.signal.aborted) {
            throw canceledError();
        }

        report("completing");
        const completed = await client.completePublication(created.id, manifest);
        if (completed.id !== created.id || completed.path !== `/p/${created.id}/` ||
            completed.fileCount !== files.length || completed.totalBytes !== uploadedBytes) {
            throw new PublishError("completing", "服务器返回的提交结果与本地清单不一致。", {
                path: "index.html",
            });
        }

        const url = new URL(completed.path, client.baseUrl).toString();
        report("done");
        console.log(`${LOG_PREFIX} publish completed id=${completed.id} files=${completed.fileCount} bytes=${completed.totalBytes} url=${url}`);
        return {
            id: completed.id,
            url,
            fileCount: completed.fileCount,
            totalBytes: completed.totalBytes,
        };
    } catch (error) {
        const publishError = asPublishError("uploading", error);
        console.error(
            `${LOG_PREFIX} publish failed stage=${publishError.stage}` +
            `${publishError.path ? ` path=${publishError.path}` : ""}` +
            `${publishError.status ? ` status=${publishError.status}` : ""}` +
            `${publishError.requestId ? ` requestId=${publishError.requestId}` : ""}`,
            publishError,
        );
        throw publishError;
    } finally {
        signal?.removeEventListener("abort", relayAbort);
        controller.abort();
    }
}

/**
 * Typed publish failures. The dialog shows `stage`, `path`, `status`, and `requestId` so a failed
 * upload can be traced to the exact file and server request.
 */
export type PublishStage =
    | "config"
    | "health"
    | "exporting"
    | "listing"
    | "reading"
    | "creating"
    | "uploading"
    | "completing"
    | "canceled";

export interface PublishErrorOptions {
    path?: string;
    status?: number;
    requestId?: string;
    cause?: unknown;
}

export class PublishError extends Error {
    readonly stage: PublishStage;
    readonly path?: string;
    readonly status?: number;
    readonly requestId?: string;
    readonly cause?: unknown;

    constructor(stage: PublishStage, message: string, options: PublishErrorOptions = {}) {
        super(message);
        this.name = "PublishError";
        this.stage = stage;
        this.path = options.path;
        this.status = options.status;
        this.requestId = options.requestId;
        this.cause = options.cause;
    }
}

export function isAbortError(error: unknown): boolean {
    return typeof error === "object" && error !== null &&
        "name" in error && (error as { name?: unknown }).name === "AbortError";
}

export function messageOf(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

export function asPublishError(stage: PublishStage, error: unknown, path?: string): PublishError {
    if (error instanceof PublishError) {
        return error;
    }
    if (isAbortError(error)) {
        return new PublishError("canceled", "发布已取消。", { cause: error });
    }
    return new PublishError(stage, messageOf(error), { path, cause: error });
}

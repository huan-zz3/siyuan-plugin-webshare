import { resolve } from "node:path";

export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";

export interface ServerConfig {
    host: string;
    port: number;
    dataDir: string;
    token: string;
    maxFileBytes: number;
    maxPublicationBytes: number;
    maxFiles: number;
    stagingTtlMs: number;
    logLevel: LogLevel;
}

const LOG_LEVELS: ReadonlySet<string> = new Set([
    "fatal", "error", "warn", "info", "debug", "trace", "silent",
]);

function positiveInteger(value: string | undefined, name: string, fallback: number): number {
    if (value === undefined || value.trim() === "") {
        return fallback;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`${name} must be a positive integer, received ${JSON.stringify(value)}.`);
    }
    return parsed;
}

function portNumber(value: string | undefined): number {
    const port = positiveInteger(value, "PORT", 8787);
    if (port > 65535) {
        throw new Error(`PORT must be between 1 and 65535, received ${port}.`);
    }
    return port;
}

function logLevel(value: string | undefined): LogLevel {
    const level = (value ?? "info").trim().toLowerCase();
    if (!LOG_LEVELS.has(level)) {
        throw new Error(`LOG_LEVEL must be one of ${[...LOG_LEVELS].join(", ")}, received ${JSON.stringify(value)}.`);
    }
    return level as LogLevel;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
    const token = (env.PUBLISH_TOKEN ?? "").trim();
    if (token.length < 32) {
        throw new Error("PUBLISH_TOKEN is required and must contain at least 32 characters.");
    }

    const hours = positiveInteger(env.STAGING_TTL_HOURS, "STAGING_TTL_HOURS", 24);
    const maxFileBytes = positiveInteger(env.MAX_FILE_BYTES, "MAX_FILE_BYTES", 64 * 1024 * 1024);
    const maxPublicationBytes = positiveInteger(env.MAX_PUBLICATION_BYTES, "MAX_PUBLICATION_BYTES", 512 * 1024 * 1024);
    const maxFiles = positiveInteger(env.MAX_FILES, "MAX_FILES", 5000);

    if (maxPublicationBytes < maxFileBytes) {
        throw new Error("MAX_PUBLICATION_BYTES must be greater than or equal to MAX_FILE_BYTES.");
    }

    return {
        host: (env.HOST ?? "127.0.0.1").trim() || "127.0.0.1",
        port: portNumber(env.PORT),
        dataDir: resolve((env.PUBLISH_DATA_DIR ?? "./data").trim() || "./data"),
        token,
        maxFileBytes,
        maxPublicationBytes,
        maxFiles,
        stagingTtlMs: hours * 60 * 60 * 1000,
        logLevel: logLevel(env.LOG_LEVEL),
    };
}

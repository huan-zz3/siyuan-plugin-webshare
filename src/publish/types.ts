/**
 * Shared types for the publish pipeline.
 */

/**
 * Values required to render the static `index.html` that accompanies a kernel HTML export.
 */
export interface TemplateParams {
    /** Body fragment produced by `/api/export/exportHTML`; inserted without escaping. */
    content: string;
    /** Document title; HTML-escaped before being inserted into `<title>`. */
    docName: string;
    /** Light theme name used for the theme stylesheet. */
    themeLight: string;
    /** Dark theme name written to `data-dark-theme`. */
    themeDark: string;
    /** Interface language written to the `<html lang>` attribute. */
    lang: string;
    /** SiYuan version used to bust static asset caches. */
    version: string;
}

/**
 * A self-contained static directory ready to be uploaded.
 */
export interface ExportArtifact {
    /** Kernel-created folder under `temp/export`, possibly containing `/` for encrypted notebooks. */
    folder: string;
    /** Absolute path of the artifact directory inside the workspace. */
    absoluteDir: string;
    /** Document name reported by the kernel export. */
    name: string;
}

/** Configuration required to reach the publish server. */
export interface PublishConfig {
    /** Server origin, for example `https://publish.example.com`. */
    baseUrl: string;
    /** Publish server bearer token; unrelated to the SiYuan API token. */
    token: string;
}

/** A file discovered inside the local export artifact. */
export interface ArtifactFile {
    /** POSIX-style path relative to the artifact root. */
    relativePath: string;
}

/** Upload phases reported to the publish dialog. */
export type PublishPhase = "exporting" | "listing" | "creating" | "uploading" | "completing" | "done";

export interface PublishProgress {
    phase: PublishPhase;
    uploadedFiles: number;
    totalFiles: number;
    uploadedBytes: number;
}

export interface PublishManifestEntry {
    path: string;
    size: number;
}

export interface PublishResult {
    id: string;
    url: string;
    fileCount: number;
    totalBytes: number;
}

export interface ServerCreateResponse {
    id: string;
    path: string;
}

export interface ServerCompleteResponse {
    id: string;
    path: string;
    fileCount: number;
    totalBytes: number;
}

export interface ServerHealthResponse {
    ok: boolean;
    service: string;
    version: number;
}

export interface ServerErrorResponse {
    error?: string;
    message?: string;
    requestId?: string;
    details?: unknown;
}

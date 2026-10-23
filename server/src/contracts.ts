export const API_SERVICE = "siyuan-publisher-server";
export const API_VERSION = 1;

export interface HealthResponse {
    ok: true;
    service: typeof API_SERVICE;
    version: number;
}

export interface CreatePublicationRequest {
    title: string;
    docId: string;
}

export interface CreatePublicationResponse {
    id: string;
    path: string;
}

export interface ManifestEntry {
    path: string;
    size: number;
}

export interface CompletePublicationRequest {
    files: ManifestEntry[];
}

export interface CompletePublicationResponse {
    id: string;
    path: string;
    fileCount: number;
    totalBytes: number;
}

export interface ErrorResponse {
    error: string;
    message: string;
    requestId: string;
    details?: unknown;
}

export class AppError extends Error {
    readonly statusCode: number;
    readonly code: string;
    readonly details?: unknown;

    constructor(statusCode: number, code: string, message: string, details?: unknown) {
        super(message);
        this.name = "AppError";
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
    }
}

export function invalidRequest(message: string, details?: unknown): AppError {
    return new AppError(400, "invalid_request", message, details);
}

export function unauthorized(message = "Missing or invalid bearer token."): AppError {
    return new AppError(401, "unauthorized", message);
}

export function notFound(message = "Publication not found."): AppError {
    return new AppError(404, "not_found", message);
}

export function conflict(code: string, message: string, details?: unknown): AppError {
    return new AppError(409, code, message, details);
}

export function tooLarge(message: string, details?: unknown): AppError {
    return new AppError(413, "too_large", message, details);
}

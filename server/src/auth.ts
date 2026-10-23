import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";

import { unauthorized } from "./errors.js";

function hash(token: string): Buffer {
    return createHash("sha256").update(token, "utf8").digest();
}

export function createAuthHook(token: string) {
    const expected = hash(token);

    return async (request: FastifyRequest): Promise<void> => {
        // CORS preflight is answered by @fastify/cors and must not require credentials.
        if (request.method === "OPTIONS") {
            return;
        }

        const header = request.headers.authorization;
        if (!header) {
            throw unauthorized("Missing Authorization header.");
        }

        const match = /^Bearer\s+(.+)$/i.exec(header);
        if (!match) {
            throw unauthorized("Authorization header must use the Bearer scheme.");
        }

        const supplied = hash(match[1].trim());
        if (!timingSafeEqual(expected, supplied)) {
            throw unauthorized("Bearer token is invalid.");
        }
    };
}

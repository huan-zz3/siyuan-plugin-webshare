import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { basename, join } from "node:path";

import { createAuthHook } from "./auth.js";
import type { ServerConfig } from "./config.js";
import { AppError } from "./errors.js";
import { isPublicationId, publicationPath } from "./storage.js";
import { registerRoutes } from "./routes.js";

interface MultipartError {
    code?: string;
    statusCode?: number;
}

function multipartStatusCode(error: MultipartError): number | undefined {
    switch (error.code) {
        case "FST_REQ_FILE_TOO_LARGE":
        case "FST_PARTS_LIMIT":
            return 413;
        case "FST_FILES_LIMIT":
        case "FST_FIELDS_LIMIT":
        case "FST_INVALID_MULTIPART_CONTENT_TYPE":
            return 400;
        default:
            return undefined;
    }
}

export async function buildApp(config: ServerConfig): Promise<FastifyInstance> {
    const app = Fastify({
        logger: config.logLevel === "silent" ? false : { level: config.logLevel },
        bodyLimit: 8 * 1024 * 1024,
    });

    await app.register(cors, {
        origin: "*",
        methods: ["GET", "POST", "PUT", "OPTIONS"],
        allowedHeaders: ["authorization", "content-type"],
        credentials: false,
        maxAge: 600,
    });

    await app.register(multipart, {
        limits: {
            fileSize: config.maxFileBytes,
            files: 1,
            fields: 0,
        },
        throwFileSizeLimit: true,
    });

    app.setNotFoundHandler(async (request, reply) => {
        return reply.code(404).send({
            error: "not_found",
            message: "Route not found.",
            requestId: request.id,
        });
    });

    app.setErrorHandler(async (error: FastifyError, request, reply) => {
        if (error instanceof AppError) {
            return reply.code(error.statusCode).send({
                error: error.code,
                message: error.message,
                requestId: request.id,
                ...(error.details === undefined ? {} : { details: error.details }),
            });
        }

        const multipartStatus = multipartStatusCode(error as MultipartError);
        if (multipartStatus === 413) {
            return reply.code(413).send({
                error: "too_large",
                message: "Uploaded file exceeds the configured limit.",
                requestId: request.id,
            });
        }
        if (multipartStatus === 400) {
            return reply.code(400).send({
                error: "invalid_request",
                message: "Malformed multipart request.",
                requestId: request.id,
            });
        }

        if (error.validation) {
            return reply.code(400).send({
                error: "invalid_request",
                message: error.message,
                requestId: request.id,
            });
        }

        if ((error as { code?: string }).code === "ENOSPC" ||
            (error as { code?: string }).code === "EDQUOT") {
            request.log.error({ err: error }, "storage is full");
            return reply.code(507).send({
                error: "storage_unavailable",
                message: "The server cannot store more data.",
                requestId: request.id,
            });
        }

        const statusCode = (error as { statusCode?: number }).statusCode;
        if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
            return reply.code(statusCode).send({
                error: "invalid_request",
                message: error.message,
                requestId: request.id,
            });
        }

        request.log.error({ err: error }, "request failed");
        return reply.code(500).send({
            error: "internal_error",
            message: "The server encountered an internal error.",
            requestId: request.id,
        });
    });

    await app.register(async (api) => {
        api.addHook("preHandler", createAuthHook(config.token));
        registerRoutes(api, config);
    }, { prefix: "/api" });

    app.get<{ Params: { id: string } }>("/p/:id", async (request, reply) => {
        const { id } = request.params;
        if (!isPublicationId(id)) {
            return reply.code(404).send({
                error: "not_found",
                message: "Publication not found.",
                requestId: request.id,
            });
        }
        return reply.code(301).header("Location", publicationPath(id)).send();
    });

    await app.register(fastifyStatic, {
        root: join(config.dataDir, "public"),
        prefix: "/p/",
        index: ["index.html"],
        list: false,
        dotfiles: "deny",
        redirect: false,
        cacheControl: false,
        setHeaders(reply, filePath) {
            reply.header("X-Content-Type-Options", "nosniff");
            if (basename(filePath) === "index.html") {
                reply.header("Cache-Control", "no-cache");
            } else {
                reply.header("Cache-Control", "public, max-age=31536000, immutable");
            }
        },
    });

    return app;
}

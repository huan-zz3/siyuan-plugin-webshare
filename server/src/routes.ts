import type { FastifyInstance } from "fastify";

import type { CompletePublicationRequest, CreatePublicationRequest } from "./contracts.js";
import { API_SERVICE, API_VERSION } from "./contracts.js";
import type { ServerConfig } from "./config.js";
import { invalidRequest, tooLarge } from "./errors.js";
import {
    commitPublication,
    createStaging,
    publicationPath,
    stagingDirForUpload,
    validateRelativePath,
    verifyManifest,
    writeUploadedFile,
} from "./storage.js";

export function registerRoutes(app: FastifyInstance, config: ServerConfig): void {
    app.get("/health", async () => ({
        ok: true,
        service: API_SERVICE,
        version: API_VERSION,
    }));

    app.post<{ Body: CreatePublicationRequest }>("/publications", {
        schema: {
            body: {
                type: "object",
                additionalProperties: false,
                required: ["title", "docId"],
                properties: {
                    title: {
                        type: "string",
                        minLength: 1,
                        maxLength: 200,
                        pattern: "^[^\\u0000-\\u001F]+$",
                    },
                    docId: {
                        type: "string",
                        minLength: 1,
                        maxLength: 64,
                        pattern: "^[A-Za-z0-9_-]+$",
                    },
                },
            },
        },
    }, async (request, reply) => {
        const { title, docId } = request.body;
        const { id } = await createStaging(config.dataDir);
        request.log.info({ publicationId: id, title, docId }, "publication created");
        return reply.code(201).send({ id, path: publicationPath(id) });
    });

    app.put<{ Params: { id: string }; Querystring: { path?: string } }>("/publications/:id/files", async (request, reply) => {
        const { id } = request.params;
        const relativePath = validateRelativePath(request.query.path);
        const stagingDir = await stagingDirForUpload(config.dataDir, id);
        const part = await request.file();
        if (!part) {
            throw invalidRequest("multipart field 'file' is required.");
        }

        const bytes = await writeUploadedFile(stagingDir, relativePath, part.file, config.maxFileBytes);
        if (part.file.truncated) {
            throw tooLarge(`File exceeds the ${config.maxFileBytes} byte limit.`);
        }
        request.log.debug({ publicationId: id, path: relativePath, bytes }, "file uploaded");
        return reply.code(204).send();
    });

    app.post<{ Params: { id: string }; Body: CompletePublicationRequest }>("/publications/:id/complete", {
        schema: {
            body: {
                type: "object",
                additionalProperties: false,
                required: ["files"],
                properties: {
                    files: {
                        type: "array",
                        minItems: 1,
                        maxItems: config.maxFiles,
                        items: {
                            type: "object",
                            additionalProperties: false,
                            required: ["path", "size"],
                            properties: {
                                path: { type: "string", minLength: 1, maxLength: 1024 },
                                size: { type: "integer", minimum: 0, maximum: config.maxFileBytes },
                            },
                        },
                    },
                },
            },
        },
    }, async (request) => {
        const { id } = request.params;
        const stagingDir = await stagingDirForUpload(config.dataDir, id);
        const verified = await verifyManifest(stagingDir, request.body.files, {
            maxFiles: config.maxFiles,
            maxFileBytes: config.maxFileBytes,
            maxPublicationBytes: config.maxPublicationBytes,
        });
        await commitPublication(config.dataDir, id);
        request.log.info({ publicationId: id, ...verified }, "publication committed");
        return {
            id,
            path: publicationPath(id),
            ...verified,
        };
    });
}

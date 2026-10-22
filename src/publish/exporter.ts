/**
 * Turns a SiYuan document into a self-contained static directory inside the workspace.
 */
import { Constants } from "siyuan";

import { exportHTML, saveBlob } from "@/api";

import { buildIndexHtml } from "./template";
import type { ExportArtifact } from "./types";

const LOG_PREFIX = "[siyuan-plugin-publisher]";

interface RuntimeConfig {
    appearance?: {
        themeLight?: string;
        themeDark?: string;
        lang?: string;
    };
    system?: {
        workspaceDir?: string;
    };
}

function getRuntimeConfig(): RuntimeConfig {
    const runtime = window.siyuan as { config?: RuntimeConfig } | undefined;
    if (!runtime || !runtime.config) {
        throw new Error(`${LOG_PREFIX} window.siyuan.config is unavailable; cannot export the document.`);
    }
    return runtime.config;
}

function requireConfigString(value: string | undefined, path: string): string {
    if (!value) {
        throw new Error(`${LOG_PREFIX} ${path} is missing; cannot build the publish artifact.`);
    }
    return value;
}

/**
 * Exports `documentId` through `/api/export/exportHTML`, writes the surrounding `index.html`, and
 * returns the directory that the kernel filled with assets.
 *
 * Encrypted notebooks are not special-cased: the kernel may return a `folder` containing `/`, and
 * path joining below keeps that structure.
 */
export async function exportDocumentAsArtifact(documentId: string): Promise<ExportArtifact> {
    console.log(`${LOG_PREFIX} export requested for document ${documentId}`);

    const resp = await exportHTML(documentId);
    console.log(`${LOG_PREFIX} export response for document ${documentId}: code=${resp.raw.code} msg=${resp.raw.msg}`);

    if (!resp.ok || !resp.data) {
        throw new Error(`${LOG_PREFIX} exportHTML failed for document ${documentId}: code=${resp.raw.code} msg=${resp.raw.msg}`);
    }

    const { content, name, folder } = resp.data;
    if (!content) {
        throw new Error(`${LOG_PREFIX} exportHTML returned empty content for document ${documentId}: ` +
            `code=${resp.raw.code} msg=${resp.raw.msg}`);
    }
    if (!folder) {
        throw new Error(`${LOG_PREFIX} exportHTML returned an empty folder for document ${documentId}: ` +
            `code=${resp.raw.code} msg=${resp.raw.msg}`);
    }

    console.log(`${LOG_PREFIX} exported document ${documentId}: folder=${folder} name=${name} contentLength=${content.length}`);

    const config = getRuntimeConfig();
    const html = buildIndexHtml({
        content,
        docName: name,
        themeLight: requireConfigString(config.appearance?.themeLight, "window.siyuan.config.appearance.themeLight"),
        themeDark: requireConfigString(config.appearance?.themeDark, "window.siyuan.config.appearance.themeDark"),
        lang: requireConfigString(config.appearance?.lang, "window.siyuan.config.appearance.lang"),
        version: Constants.SIYUAN_VERSION,
    });
    console.log(`${LOG_PREFIX} generated index.html for folder=${folder}: htmlLength=${html.length}`);

    const writePath = `temp/export/${folder}/index.html`;
    console.log(`${LOG_PREFIX} writing ${writePath}`);
    const write = await saveBlob(writePath, html);
    console.log(`${LOG_PREFIX} write response for ${writePath}: code=${write.raw.code} msg=${write.raw.msg}`);

    if (!write.ok) {
        throw new Error(`${LOG_PREFIX} failed to write ${writePath}: code=${write.raw.code} msg=${write.raw.msg}`);
    }

    const workspaceDir = requireConfigString(config.system?.workspaceDir, "window.siyuan.config.system.workspaceDir");
    const absoluteDir = `${workspaceDir}/temp/export/${folder}`;
    console.log(`${LOG_PREFIX} artifact ready for document ${documentId}: absoluteDir=${absoluteDir}`);

    return { folder, absoluteDir, name };
}

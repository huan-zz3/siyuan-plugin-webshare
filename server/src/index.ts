import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { cleanupStaging, ensureDataLayout } from "./storage.js";

const envFile = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
}

async function main(): Promise<void> {
    const config = loadConfig();
    await ensureDataLayout(config.dataDir);

    const app = await buildApp(config);
    const removed = await cleanupStaging(config.dataDir, config.stagingTtlMs);
    if (removed.length > 0) {
        app.log.info({ removed }, "stale staging directories removed");
    }

    const cleanupTimer = setInterval(() => {
        cleanupStaging(config.dataDir, config.stagingTtlMs)
            .then((ids) => {
                if (ids.length > 0) {
                    app.log.info({ removed: ids }, "stale staging directories removed");
                }
            })
            .catch((error) => app.log.error({ err: error }, "staging cleanup failed"));
    }, 24 * 60 * 60 * 1000);
    cleanupTimer.unref();

    let closing = false;
    const shutdown = async (signal: string): Promise<void> => {
        if (closing) {
            return;
        }
        closing = true;
        app.log.info({ signal }, "shutting down");
        clearInterval(cleanupTimer);
        await app.close();
        process.exit(0);
    };

    process.once("SIGINT", () => void shutdown("SIGINT"));
    process.once("SIGTERM", () => void shutdown("SIGTERM"));

    await app.listen({ host: config.host, port: config.port });
    app.log.info({
        host: config.host,
        port: config.port,
        dataDir: config.dataDir,
        logLevel: config.logLevel,
    }, "siyuan-publisher-server listening");
}

main().catch((error) => {
    console.error("[siyuan-publisher-server] startup failed", error);
    process.exit(1);
});

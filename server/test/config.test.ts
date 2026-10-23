import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadConfig } from "../src/config.js";

const TOKEN = "a".repeat(32);

describe("loadConfig", () => {
    it("requires a publish token of at least 32 characters", () => {
        assert.throws(() => loadConfig({}), /PUBLISH_TOKEN/);
        assert.throws(() => loadConfig({ PUBLISH_TOKEN: "short" }), /PUBLISH_TOKEN/);
    });

    it("uses documented defaults", () => {
        const config = loadConfig({ PUBLISH_TOKEN: TOKEN });
        assert.equal(config.host, "127.0.0.1");
        assert.equal(config.port, 8787);
        assert.equal(config.maxFileBytes, 64 * 1024 * 1024);
        assert.equal(config.maxPublicationBytes, 512 * 1024 * 1024);
        assert.equal(config.maxFiles, 5000);
        assert.equal(config.stagingTtlMs, 24 * 60 * 60 * 1000);
        assert.equal(config.logLevel, "info");
    });

    it("parses explicit values", () => {
        const config = loadConfig({
            PUBLISH_TOKEN: TOKEN,
            HOST: "0.0.0.0",
            PORT: "9000",
            PUBLISH_DATA_DIR: "./tmp-publish",
            MAX_FILE_BYTES: "10",
            MAX_PUBLICATION_BYTES: "100",
            MAX_FILES: "12",
            STAGING_TTL_HOURS: "2",
            LOG_LEVEL: "debug",
        });
        assert.equal(config.host, "0.0.0.0");
        assert.equal(config.port, 9000);
        assert.equal(config.maxFileBytes, 10);
        assert.equal(config.maxPublicationBytes, 100);
        assert.equal(config.maxFiles, 12);
        assert.equal(config.stagingTtlMs, 2 * 60 * 60 * 1000);
        assert.equal(config.logLevel, "debug");
        assert.match(config.dataDir, /tmp-publish$/);
    });

    it("rejects invalid numeric values", () => {
        assert.throws(() => loadConfig({ PUBLISH_TOKEN: TOKEN, PORT: "0" }), /PORT/);
        assert.throws(() => loadConfig({ PUBLISH_TOKEN: TOKEN, PORT: "70000" }), /PORT/);
        assert.throws(() => loadConfig({ PUBLISH_TOKEN: TOKEN, MAX_FILES: "1.5" }), /MAX_FILES/);
        assert.throws(() => loadConfig({ PUBLISH_TOKEN: TOKEN, LOG_LEVEL: "loud" }), /LOG_LEVEL/);
    });

    it("requires the publication limit to cover one file", () => {
        assert.throws(() => loadConfig({
            PUBLISH_TOKEN: TOKEN,
            MAX_FILE_BYTES: "100",
            MAX_PUBLICATION_BYTES: "50",
        }), /MAX_PUBLICATION_BYTES/);
    });
});

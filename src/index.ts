import {
    Plugin,
    showMessage,
    Menu,
    getFrontend,
    getAllEditor,
    IProtyle,
} from "siyuan";
import "./index.scss";

import { exportDocumentAsArtifact } from "@/publish/exporter";
import PublishDialog from "@/publish/publish-dialog.svelte";
import { PublishClient } from "@/publish/publish-client";
import type { PublishConfig } from "@/publish/types";

import { SettingUtils } from "./libs/setting-utils";
import { svelteDialog } from "./libs/dialog";

const STORAGE_NAME = "menu-config";

// 顶栏图标：文档 + 地球，取自插件图标的关键元素；单色描边以适配思源主题。
const SHARE_ICON = `<symbol id="iconDocWebShare" viewBox="0 0 32 32">
<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
<path d="M6 3.5h8.5L20 9v6.5"/>
<path d="M6 3.5V26h7.5"/>
<path d="M14.5 3.5V9H20"/>
<path d="M9.5 15h6M9.5 20h4.5"/>
<circle cx="23" cy="22.5" r="6"/>
<path d="M17 22.5h12"/>
<path d="M23 16.5c2.2 2.6 2.2 9.4 0 12M23 16.5c-2.2 2.6-2.2 9.4 0 12"/>
</g>
</symbol>`;

export default class SiYuanPublisherPlugin extends Plugin {

    private isMobile: boolean;
    private settingUtils: SettingUtils;
    private publishDialog?: ReturnType<typeof svelteDialog>;
    private publishAbort?: AbortController;

    async onload() {
        console.log("Loading siyuan-plugin-webshare");

        const frontEnd = getFrontend();
        this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";

        this.addIcons(SHARE_ICON);

        this.addCommand({
            langKey: "exportPublishArtifact",
            editorCallback: async (protyle: IProtyle) => {
                const documentId = protyle.block?.rootID;
                if (!documentId) {
                    showMessage(this.i18n.exportPublishArtifactNoDoc);
                    return;
                }
                await this.exportDocument(documentId);
            },
        });

        this.addCommand({
            langKey: "publishDocument",
            editorCallback: (protyle: IProtyle) => {
                this.publishActiveDocument(protyle.block?.rootID);
            },
        });

        const publishLabels = this.i18n.publish as unknown as Record<string, string>;
        this.settingUtils = new SettingUtils({
            plugin: this, name: STORAGE_NAME
        });
        this.settingUtils.addItem({
            key: "publishServerUrl",
            value: "",
            type: "textinput",
            title: publishLabels.settingsUrlTitle,
            description: publishLabels.settingsUrlDesc,
            placeholder: "https://publish.example.com",
        });
        this.settingUtils.addItem({
            key: "publishServerToken",
            value: "",
            type: "custom",
            title: publishLabels.settingsTokenTitle,
            description: publishLabels.settingsTokenDesc,
            createElement: (currentVal: any) => {
                const input = document.createElement("input");
                input.className = "b3-text-field fn__block";
                input.type = "password";
                input.autocomplete = "off";
                input.value = typeof currentVal === "string" ? currentVal : "";
                return input;
            },
            getEleVal: (ele: HTMLElement) => (ele as HTMLInputElement).value,
            setEleVal: (ele: HTMLElement, val: any) => {
                (ele as HTMLInputElement).value = typeof val === "string" ? val : "";
            },
        });
        this.settingUtils.addItem({
            key: "publishTestConnection",
            value: "",
            type: "button",
            title: publishLabels.settingsTestTitle,
            description: publishLabels.settingsTestDesc,
            button: {
                label: publishLabels.testConnection,
                callback: () => {
                    void this.testPublishConnection();
                },
            },
        });
        this.settingUtils.addItem({
            key: "publishHint",
            value: "",
            type: "hint",
            title: publishLabels.settingsHintTitle,
            description: publishLabels.settingsHintDesc,
        });

        try {
            await this.settingUtils.load();
        } catch (error) {
            console.error("[siyuan-plugin-webshare] failed to load settings", error);
        }
    }

    onLayoutReady() {
        const topBarElement = this.addTopBar({
            icon: "iconDocWebShare",
            title: this.i18n.addTopBarIcon,
            position: "right",
            callback: () => {
                if (this.isMobile) {
                    this.addMenu();
                } else {
                    let rect = topBarElement.getBoundingClientRect();
                    // 如果被隐藏，则使用更多按钮
                    if (rect.width === 0) {
                        rect = document.querySelector("#barMore").getBoundingClientRect();
                    }
                    if (rect.width === 0) {
                        rect = document.querySelector("#barPlugins").getBoundingClientRect();
                    }
                    this.addMenu(rect);
                }
            }
        });
    }

    async onunload() {
        this.publishAbort?.abort();
        this.publishDialog?.close();
        this.publishDialog = undefined;
        this.publishAbort = undefined;
    }

    async uninstall() {
        // 卸载插件时删除插件数据
        await this.removeData(STORAGE_NAME).catch(e => {
            showMessage(`uninstall [${this.name}] remove data [${STORAGE_NAME}] fail: ${e.msg}`);
        });
    }

    private async exportDocument(documentId: string): Promise<void> {
        try {
            const artifact = await exportDocumentAsArtifact(documentId);
            showMessage(`${this.i18n.exportPublishArtifactSuccess}${artifact.absoluteDir}`, 8000);
        } catch (error) {
            console.error("[siyuan-plugin-webshare] export failed", error);
            const reason = error instanceof Error ? error.message : String(error);
            showMessage(`${this.i18n.exportPublishArtifactFailed}: ${reason}`, 10000);
        }
    }

    private exportActiveDocument(): void {
        const documentId = this.getEditor()?.protyle.block.rootID;
        if (!documentId) {
            showMessage(this.i18n.exportPublishArtifactNoDoc);
            return;
        }
        void this.exportDocument(documentId);
    }

    private publishActiveDocument(documentId?: string): void {
        const targetId = documentId ?? this.getEditor()?.protyle.block.rootID;
        if (!targetId) {
            showMessage(this.i18n.publishDocumentNoDoc);
            return;
        }
        const config = this.readPublishConfig();
        if (!config) {
            showMessage(this.i18n.publishMissingConfig, 10000);
            this.openSetting();
            return;
        }
        this.openPublishDialog(targetId, config);
    }

    private readPublishConfig(): PublishConfig | null {
        const baseUrl = String(this.settingUtils?.get("publishServerUrl") ?? "").trim();
        const token = String(this.settingUtils?.get("publishServerToken") ?? "").trim();
        if (!baseUrl || !token) {
            return null;
        }
        return { baseUrl, token };
    }

    private async testPublishConnection(): Promise<void> {
        const labels = this.i18n.publish as unknown as Record<string, string>;
        const baseUrl = String(this.settingUtils.take("publishServerUrl") ?? "").trim();
        const token = String(this.settingUtils.take("publishServerToken") ?? "").trim();
        if (!baseUrl || !token) {
            showMessage(labels.testMissing, 8000);
            return;
        }

        try {
            const client = new PublishClient({ baseUrl, token });
            const health = await client.health();
            if (!health.ok || health.service !== "siyuan-publisher-server") {
                throw new Error(`unexpected service response: ${JSON.stringify(health)}`);
            }
            showMessage(labels.testOk, 5000);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            console.error("[siyuan-plugin-webshare] publish connection test failed", error);
            showMessage(`${labels.testFailed}: ${reason}`, 10000);
        }
    }

    private openPublishDialog(documentId: string, config: PublishConfig): void {
        this.publishAbort?.abort();
        this.publishDialog?.close();
        this.publishDialog = undefined;
        this.publishAbort = undefined;

        const labels = this.i18n.publish as unknown as Record<string, string>;
        const controller = new AbortController();
        this.publishAbort = controller;

        try {
            this.publishDialog = svelteDialog({
                title: labels.dialogTitle,
                width: this.isMobile ? "92vw" : "600px",
                component: PublishDialog,
                props: {
                    labels,
                    config,
                    documentId,
                    signal: controller.signal,
                },
                callback: () => {
                    controller.abort();
                    this.publishDialog = undefined;
                    this.publishAbort = undefined;
                },
            });
        } catch (error) {
            controller.abort();
            this.publishAbort = undefined;
            console.error("[siyuan-plugin-webshare] failed to open publish dialog", error);
            const reason = error instanceof Error ? error.message : String(error);
            showMessage(`${labels.failed}: ${reason}`, 10000);
        }
    }

    private addMenu(rect?: DOMRect) {
        const menu = new Menu("docWebShare");
        menu.addItem({
            icon: "iconDocWebShare",
            label: this.i18n.publishDocument,
            click: () => {
                this.publishActiveDocument();
            }
        });
        menu.addItem({
            icon: "iconDownload",
            label: this.i18n.exportPublishArtifact,
            click: () => {
                this.exportActiveDocument();
            }
        });
        menu.addSeparator();
        menu.addItem({
            icon: "iconSettings",
            label: this.i18n.pluginSettings,
            click: () => {
                this.openSetting();
            }
        });
        if (this.isMobile) {
            menu.fullscreen();
        } else if (rect) {
            menu.open({
                x: rect.right,
                y: rect.bottom,
                isLeft: true,
            });
        }
    }

    private getEditor() {
        return getAllEditor()[0];
    }
}

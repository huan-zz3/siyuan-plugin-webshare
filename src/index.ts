import {
    Plugin,
    showMessage,
    confirm,
    Menu,
    openTab,
    adaptHotkey,
    getFrontend,
    getBackend,
    // Setting,
    // fetchPost,
    Protyle,
    IProtyle,
    openWindow,
    IOperation,
    Constants,
    openMobileFileById,
    lockScreen,
    ICard,
    ICardData,
    exitSiYuan,
    getModelByDockType,
    getAllEditor,
    Files,
    // platformUtils,
    openSetting,
    openAttributePanel,
    saveLayout,
    IKernelPluginState,
    IMenuItem
} from "siyuan";
import "./index.scss";

import HelloExample from "@/hello.svelte";
import CaptureConsole from "@/kernel-capture/capture-console.svelte";
import type { CaptureBroadcast, CaptureResult } from "@/kernel-capture/contracts";
import { exportDocumentAsArtifact } from "@/publish/exporter";
import PublishDialog from "@/publish/publish-dialog.svelte";
import { PublishClient } from "@/publish/publish-client";
import type { PublishConfig } from "@/publish/types";

import { SettingUtils } from "./libs/setting-utils";
import { svelteDialog } from "./libs/dialog";
import { mount, unmount } from "svelte";

const STORAGE_NAME = "menu-config";
const TAB_TYPE = "custom_tab";
const DOCK_TYPE = "dock_tab";

interface CaptureConsoleHandle {
    showCapture?: (result: CaptureResult) => void;
}

export default class SiYuanPublisherPlugin extends Plugin {

    private isMobile: boolean;
    private blockIconEventBindThis = this.blockIconEvent.bind(this);
    private settingUtils: SettingUtils;
    private captureDialog?: ReturnType<typeof svelteDialog>;
    private publishDialog?: ReturnType<typeof svelteDialog>;
    private publishAbort?: AbortController;


    updateProtyleToolbar(toolbar: Array<string | IMenuItem>) {
        toolbar.push("|");
        toolbar.push({
            name: "insert-smail-emoji",
            icon: "iconEmoji",
            hotkey: "⇧⌘I",
            tipPosition: "n",
            tip: this.i18n.insertEmoji,
            click(protyle: Protyle) {
                protyle.insert("😊");
            }
        });
        return toolbar;
    }

    async onload() {
        this.data[STORAGE_NAME] = { readonlyText: "Readonly" };

        console.log("Loading siyuan-plugin-webshare");

        this.kernel.rpc.bind("notify", this.onKernelPluginNotify);
        this.kernel.rpc.bind("capture-received", this.onCaptureReceived);
        this.eventBus.on("kernel-plugin-state-change", this.onKernelPluginStateChange);

        const frontEnd = getFrontend();
        this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";
        // 图标的制作参见帮助文档
        this.addIcons(`<symbol id="iconFace" viewBox="0 0 32 32">
<path d="M13.667 17.333c0 0.92-0.747 1.667-1.667 1.667s-1.667-0.747-1.667-1.667 0.747-1.667 1.667-1.667 1.667 0.747 1.667 1.667zM20 15.667c-0.92 0-1.667 0.747-1.667 1.667s0.747 1.667 1.667 1.667 1.667-0.747 1.667-1.667-0.747-1.667-1.667-1.667zM29.333 16c0 7.36-5.973 13.333-13.333 13.333s-13.333-5.973-13.333-13.333 5.973-13.333 13.333-13.333 13.333 5.973 13.333 13.333zM14.213 5.493c1.867 3.093 5.253 5.173 9.12 5.173 0.613 0 1.213-0.067 1.787-0.16-1.867-3.093-5.253-5.173-9.12-5.173-0.613 0-1.213 0.067-1.787 0.16zM5.893 12.627c2.28-1.293 4.040-3.4 4.88-5.92-2.28 1.293-4.040 3.4-4.88 5.92zM26.667 16c0-1.040-0.16-2.040-0.44-2.987-0.933 0.2-1.893 0.32-2.893 0.32-4.173 0-7.893-1.92-10.347-4.92-1.4 3.413-4.187 6.093-7.653 7.4 0.013 0.053 0 0.12 0 0.187 0 5.88 4.787 10.667 10.667 10.667s10.667-4.787 10.667-10.667z"></path>
</symbol>
<symbol id="iconSaving" viewBox="0 0 32 32">
<path d="M20 13.333c0-0.733 0.6-1.333 1.333-1.333s1.333 0.6 1.333 1.333c0 0.733-0.6 1.333-1.333 1.333s-1.333-0.6-1.333-1.333zM10.667 12h6.667v-2.667h-6.667v2.667zM29.333 10v9.293l-3.76 1.253-2.24 7.453h-7.333v-2.667h-2.667v2.667h-7.333c0 0-3.333-11.28-3.333-15.333s3.28-7.333 7.333-7.333h6.667c1.213-1.613 3.147-2.667 5.333-2.667 1.107 0 2 0.893 2 2 0 0.28-0.053 0.533-0.16 0.773-0.187 0.453-0.347 0.973-0.427 1.533l3.027 3.027h2.893zM26.667 12.667h-1.333l-4.667-4.667c0-0.867 0.12-1.72 0.347-2.547-1.293 0.333-2.347 1.293-2.787 2.547h-8.227c-2.573 0-4.667 2.093-4.667 4.667 0 2.507 1.627 8.867 2.68 12.667h2.653v-2.667h8v2.667h2.68l2.067-6.867 3.253-1.093v-4.707z"></path>
</symbol>`);

        let tabDiv = document.createElement("div");
        let app = null;
        this.addTab({
            type: TAB_TYPE,
            init() {
                app = mount(HelloExample, {
                    target: tabDiv,
                    props: {
                        app: this.app,
                        blockID: this.data.blockID
                    }
                });
                this.element.appendChild(tabDiv);
                console.log(this.element);
            },
            beforeDestroy() {
                console.log("before destroy tab:", TAB_TYPE);
            },
            destroy() {
                // app?.$destroy();
                app && unmount(app);
                console.log("destroy tab:", TAB_TYPE);
            }
        });

        this.addCommand({
            langKey: "showDialog",
            hotkey: "⇧⌘O",
            callback: () => {
                this.showDialog();
            },
        });

        this.addCommand({
            langKey: "getTab",
            hotkey: "⇧⌘M",
            globalCallback: () => {
                console.log(this.getOpenedTab());
            },
        });

        this.addCommand({
            langKey: "exportPublishArtifact",
            editorCallback: async (protyle: IProtyle) => {
                const documentId = protyle.block?.rootID;
                if (!documentId) {
                    showMessage(this.i18n.exportPublishArtifactNoDoc);
                    return;
                }
                try {
                    const artifact = await exportDocumentAsArtifact(documentId);
                    showMessage(`${this.i18n.exportPublishArtifactSuccess}${artifact.absoluteDir}`, 8000);
                } catch (error) {
                    console.error("[siyuan-plugin-webshare] export failed", error);
                    const reason = error instanceof Error ? error.message : String(error);
                    showMessage(`${this.i18n.exportPublishArtifactFailed}: ${reason}`, 10000);
                }
            },
        });

        this.addCommand({
            langKey: "publishDocument",
            editorCallback: (protyle: IProtyle) => {
                const documentId = protyle.block?.rootID;
                if (!documentId) {
                    showMessage(this.i18n.publishDocumentNoDoc);
                    return;
                }
                const config = this.readPublishConfig();
                if (!config) {
                    showMessage(this.i18n.publishMissingConfig, 10000);
                    this.openSetting();
                    return;
                }
                this.openPublishDialog(documentId, config);
            },
        });

        const isMobile = this.isMobile;
        this.addDock({
            config: {
                position: "LeftBottom",
                size: { width: 200, height: 0 },
                icon: "iconSaving",
                title: "Custom Dock",
                hotkey: "⌥⌘W",
            },
            data: {
                text: "This is my custom dock"
            },
            type: DOCK_TYPE,
            resize() {
                console.log(DOCK_TYPE + " resize");
            },
            update() {
                console.log(DOCK_TYPE + " update");
            },
            init() {
                if (isMobile) {
                    this.element.innerHTML = `<div class="toolbar toolbar--border toolbar--dark">
                    <svg class="toolbar__icon"><use xlink:href="#iconEmoji"></use></svg>
                        <div class="toolbar__text">Custom Dock</div>
                    </div>
                    <div class="fn__flex-1 siyuan-publisher__custom-dock">
                        ${this.data.text}
                    </div>
                    </div>`;
                } else {
                    this.element.innerHTML = `<div class="fn__flex-1 fn__flex-column">
                    <div class="block__icons">
                        <div class="block__logo">
                            <svg class="block__logoicon"><use xlink:href="#iconEmoji"></use></svg>
                            Custom Dock
                        </div>
                        <span class="fn__flex-1 fn__space"></span>
                        <span data-type="min" class="block__icon ariaLabel" data-position="north" aria-label="Min ${adaptHotkey("⌘W")}"><svg><use xlink:href="#iconMin"></use></svg></span>
                    </div>
                    <div class="fn__flex-1 siyuan-publisher__custom-dock">
                        ${this.data.text}
                    </div>
                    </div>`;
                }
            },
            destroy() {
                console.log("destroy dock:", DOCK_TYPE);
            }
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
            this.settingUtils.load();
        } catch (error) {
            console.error("Error loading settings storage, probably empty config json:", error);
        }


        this.protyleSlash = [{
            filter: ["insert emoji 😊", "插入表情 😊", "crbqwx"],
            html: `<div class="b3-list-item__first"><span class="b3-list-item__text">${this.i18n.insertEmoji}</span><span class="b3-list-item__meta">😊</span></div>`,
            id: "insertEmoji",
            callback(protyle: Protyle) {
                protyle.insert("😊");
            }
        }];

        this.protyleOptions = {
            toolbar: ["block-ref",
                "a",
                "|",
                "text",
                "strong",
                "em",
                "u",
                "s",
                "mark",
                "sup",
                "sub",
                "clear",
                "|",
                "code",
                "kbd",
                "tag",
                "inline-math",
                "inline-memo",
            ],
        };

        console.log(this.i18n.helloPlugin);
    }

    onLayoutReady() {
        const topBarElement = this.addTopBar({
            icon: "iconFace",
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

        const statusIconTemp = document.createElement("template");
        statusIconTemp.innerHTML = `<div class="toolbar__item ariaLabel" aria-label="Remove siyuan-plugin-webshare Data">
    <svg>
        <use xlink:href="#iconTrashcan"></use>
    </svg>
</div>`;
        statusIconTemp.content.firstElementChild.addEventListener("click", () => {
            confirm("⚠️", this.i18n.confirmRemove.replace("${name}", this.name), () => {
                this.removeData(STORAGE_NAME).then(() => {
                    this.data[STORAGE_NAME] = { readonlyText: "Readonly" };
                    showMessage(`[${this.name}]: ${this.i18n.removedData}`);
                }).catch(e => {
                    showMessage(`[${this.name}] remove data [${STORAGE_NAME}] fail: `, e);
                });
            });
        });
        this.addStatusBar({
            element: statusIconTemp.content.firstElementChild as HTMLElement,
        });
        // this.loadData(STORAGE_NAME);
        this.settingUtils.load().catch(e => {
            console.log(`[${this.name}] load settings [${STORAGE_NAME}] fail: `, e);
        });
        console.log(`frontend: ${getFrontend()}; backend: ${getBackend()}`);

        console.log(
            "Official settings value calling example:\n" +
            this.settingUtils.get("InputArea") + "\n" +
            this.settingUtils.get("Slider") + "\n" +
            this.settingUtils.get("Select") + "\n"
        );
    }

    async onunload() {
        console.log(this.i18n.byePlugin);
        this.publishAbort?.abort();
        this.publishDialog?.close();
        this.publishDialog = undefined;
        this.publishAbort = undefined;
        this.captureDialog?.close();
        this.captureDialog = undefined;
        this.kernel.rpc.unbind("notify", this.onKernelPluginNotify);
        this.kernel.rpc.unbind("capture-received", this.onCaptureReceived);
        this.eventBus.off("kernel-plugin-state-change", this.onKernelPluginStateChange);
        showMessage("Goodbye SiYuan Plugin");
        console.log("onunload");
    }

    async uninstall() {
        console.log("uninstall");
        // 卸载插件时删除插件数据
        // Delete plugin data when uninstalling the plugin
        await this.removeData(STORAGE_NAME).catch(e => {
            showMessage(`uninstall [${this.name}] remove data [${STORAGE_NAME}] fail: ${e.msg}`);
        });
    }

    // 使用 saveData() 存储的数据发生变更 (如多端数据同步) 时触发，注释掉则自动禁用插件再重新启用
    // Triggered when data stored using saveData() changes (for example, multi-device data synchronization). If commented out, the plugin will be automatically disabled and then re-enabled.
    // onDataChanged() {
    //     console.log("onDataChanged");
    // }

    private readonly onKernelPluginNotify = async (message: string) => {
        console.log("kernel plugin notify", message);
        showMessage(`[kernel] ${message}`);
    };

    private readonly onKernelPluginStateChange = ({ detail }: CustomEvent<IKernelPluginState>) => {
        console.log("kernel-plugin-state-change", detail);
    };

    private readonly onCaptureReceived = (event: CaptureBroadcast) => {
        if (this.captureDialog) {
            (this.captureDialog.component as CaptureConsoleHandle).showCapture?.(event.result);
            return;
        }

        if (event.openUi && document.visibilityState === "visible") {
            this.openCaptureConsole(event.result);
        }
    };

    async updateCards(options: ICardData) {
        options.cards.sort((a: ICard, b: ICard) => {
            if (a.blockID < b.blockID) {
                return -1;
            }
            if (a.blockID > b.blockID) {
                return 1;
            }
            return 0;
        });
        return options;
    }
    private eventBusPaste(event: any) {
        // 如果需异步处理请调用 preventDefault， 否则会进行默认处理
        event.preventDefault();
        // 如果使用了 preventDefault，必须调用 resolve，否则程序会卡死
        event.detail.resolve({
            textPlain: event.detail.textPlain.trim(),
        });
    }

    private eventBusLog({ detail }: any) {
        console.log(detail);
    }

    private blockIconEvent({ detail }: any) {
        detail.menu.addItem({
            id: "pluginSample_removeSpace",
            iconHTML: "",
            label: this.i18n.removeSpace,
            click: () => {
                const doOperations: IOperation[] = [];
                detail.blockElements.forEach((item: HTMLElement) => {
                    const editElement = item.querySelector('[contenteditable="true"]');
                    if (editElement) {
                        editElement.textContent = editElement.textContent.replace(/ /g, "");
                        doOperations.push({
                            id: item.dataset.nodeId,
                            data: item.outerHTML,
                            action: "update"
                        });
                    }
                });
                detail.protyle.getInstance().transaction(doOperations);
            }
        });
    }

    private showDialog() {
        const docId = this.getEditor().protyle.block.rootID;
        svelteDialog({
            title: `SiYuan ${Constants.SIYUAN_VERSION}`,
            width: this.isMobile ? "92vw" : "720px",
            component: HelloExample,
            props: {
                app: this.app,
                blockID: docId
            }
        });
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

    private openCaptureConsole(initialResult?: CaptureResult) {
        const labels = this.i18n.kernelCapture as unknown as Record<string, string>;
        if (this.captureDialog) {
            if (initialResult) {
                (this.captureDialog.component as CaptureConsoleHandle).showCapture?.(initialResult);
            }
            return;
        }

        this.captureDialog = svelteDialog({
            title: labels.title,
            width: this.isMobile ? "96vw" : "860px",
            component: CaptureConsole,
            props: {
                pluginName: this.name,
                labels,
                initialResult,
            },
            callback: () => {
                this.captureDialog = undefined;
            },
        });
    }

    private addMenu(rect?: DOMRect) {
        const captureLabels = this.i18n.kernelCapture as unknown as Record<string, string>;
        const menu = new Menu("topBarSample", () => {
            console.log(this.i18n.byeMenu);
        });
        menu.addItem({
            icon: "iconSettings",
            label: "Open SiYuan Setting",
            click: () => {
                openSetting(this.app);
            }
        });
        menu.addItem({
            icon: "iconSettings",
            label: "Open Plugin Setting",
            click: () => {
                this.openSetting();
            }
        });
        menu.addItem({
            icon: "iconUpload",
            label: this.i18n.publishDocument,
            click: () => {
                const editor = this.getEditor();
                if (!editor) {
                    return;
                }
                const documentId = editor.protyle.block.rootID;
                if (!documentId) {
                    showMessage(this.i18n.publishDocumentNoDoc);
                    return;
                }
                const config = this.readPublishConfig();
                if (!config) {
                    showMessage(this.i18n.publishMissingConfig, 10000);
                    this.openSetting();
                    return;
                }
                this.openPublishDialog(documentId, config);
            }
        });
        menu.addSeparator();
        menu.addItem({
            icon: "iconInbox",
            label: captureLabels.menu,
            click: () => this.openCaptureConsole(),
        });
        menu.addSeparator();
        menu.addItem({
            icon: "iconDrag",
            label: "Open Attribute Panel",
            click: () => {
                openAttributePanel({
                    nodeElement: this.getEditor().protyle.wysiwyg.element.firstElementChild as HTMLElement,
                    protyle: this.getEditor().protyle,
                    focusName: "custom",
                });
            }
        });
        menu.addItem({
            icon: "iconInfo",
            label: "Dialog(open doc first)",
            accelerator: this.commands[0].customHotkey,
            click: () => {
                this.showDialog();
            }
        });
        menu.addItem({
            icon: "iconFocus",
            label: "Select Opened Doc(open doc first)",
            click: () => {
                (getModelByDockType("file") as Files).selectItem(this.getEditor().protyle.notebookId, this.getEditor().protyle.path);
            }
        });
        if (!this.isMobile) {
            menu.addItem({
                icon: "iconFace",
                label: "Open Custom Tab(open doc first)",
                click: () => {
                    const tab = openTab({
                        app: this.app,
                        custom: {
                            icon: "iconFace",
                            title: "Custom Tab",
                            data: {
                                // text: platformUtils.isHuawei() ? "Hello, Huawei!" : "This is my custom tab",
                                blockID: this.getEditor().protyle.block.rootID,
                            },
                            id: this.name + TAB_TYPE
                        },
                    });
                    console.log(tab);
                }
            });
            menu.addItem({
                icon: "iconImage",
                label: "Open Asset Tab(First open the Chinese help document)",
                click: () => {
                    const tab = openTab({
                        app: this.app,
                        asset: {
                            path: "assets/paragraph-20210512165953-ag1nib4.svg"
                        }
                    });
                    console.log(tab);
                }
            });
            menu.addItem({
                icon: "iconFile",
                label: "Open Doc Tab(open doc first)",
                click: async () => {
                    const tab = await openTab({
                        app: this.app,
                        doc: {
                            id: this.getEditor().protyle.block.rootID,
                        }
                    });
                    console.log(tab);
                }
            });
            menu.addItem({
                icon: "iconSearch",
                label: "Open Search Tab",
                click: () => {
                    const tab = openTab({
                        app: this.app,
                        search: {
                            k: "SiYuan"
                        }
                    });
                    console.log(tab);
                }
            });
            menu.addItem({
                icon: "iconRiffCard",
                label: "Open Card Tab",
                click: () => {
                    const tab = openTab({
                        app: this.app,
                        card: {
                            type: "all"
                        }
                    });
                    console.log(tab);
                }
            });
            menu.addItem({
                icon: "iconLayout",
                label: "Open Float Layer(open doc first)",
                click: () => {
                    this.addFloatLayer({
                        refDefs: [{ refID: this.getEditor().protyle.block.rootID }],
                        x: window.innerWidth - 768 - 120,
                        y: 32,
                        isBacklink: false
                    });
                }
            });
            menu.addItem({
                icon: "iconOpenWindow",
                label: "Open Doc Window(open doc first)",
                click: () => {
                    openWindow({
                        doc: { id: this.getEditor().protyle.block.rootID }
                    });
                }
            });
        } else {
            menu.addItem({
                icon: "iconFile",
                label: "Open Doc(open doc first)",
                click: () => {
                    openMobileFileById(this.app, this.getEditor().protyle.block.rootID);
                }
            });
        }
        menu.addItem({
            icon: "iconLock",
            label: "Lockscreen",
            click: () => {
                lockScreen(this.app);
            }
        });
        menu.addItem({
            icon: "iconQuit",
            label: "Exit Application",
            click: () => {
                exitSiYuan();
            }
        });
        menu.addItem({
            icon: "iconDownload",
            label: "Save Layout",
            click: () => {
                saveLayout(() => {
                    showMessage("Layout saved");
                });
            }
        });
        menu.addItem({
            icon: "iconScrollHoriz",
            label: "Event Bus",
            type: "submenu",
            submenu: [{
                icon: "iconSelect",
                label: "On ws-main",
                click: () => {
                    this.eventBus.on("ws-main", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off ws-main",
                click: () => {
                    this.eventBus.off("ws-main", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On click-blockicon",
                click: () => {
                    this.eventBus.on("click-blockicon", this.blockIconEventBindThis);
                }
            }, {
                icon: "iconClose",
                label: "Off click-blockicon",
                click: () => {
                    this.eventBus.off("click-blockicon", this.blockIconEventBindThis);
                }
            }, {
                icon: "iconSelect",
                label: "On click-pdf",
                click: () => {
                    this.eventBus.on("click-pdf", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off click-pdf",
                click: () => {
                    this.eventBus.off("click-pdf", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On click-editorcontent",
                click: () => {
                    this.eventBus.on("click-editorcontent", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off click-editorcontent",
                click: () => {
                    this.eventBus.off("click-editorcontent", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On click-editortitleicon",
                click: () => {
                    this.eventBus.on("click-editortitleicon", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off click-editortitleicon",
                click: () => {
                    this.eventBus.off("click-editortitleicon", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On click-flashcard-action",
                click: () => {
                    this.eventBus.on("click-flashcard-action", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off click-flashcard-action",
                click: () => {
                    this.eventBus.off("click-flashcard-action", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On open-noneditableblock",
                click: () => {
                    this.eventBus.on("open-noneditableblock", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off open-noneditableblock",
                click: () => {
                    this.eventBus.off("open-noneditableblock", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On loaded-protyle-static",
                click: () => {
                    this.eventBus.on("loaded-protyle-static", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off loaded-protyle-static",
                click: () => {
                    this.eventBus.off("loaded-protyle-static", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On loaded-protyle-dynamic",
                click: () => {
                    this.eventBus.on("loaded-protyle-dynamic", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off loaded-protyle-dynamic",
                click: () => {
                    this.eventBus.off("loaded-protyle-dynamic", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On switch-protyle",
                click: () => {
                    this.eventBus.on("switch-protyle", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off switch-protyle",
                click: () => {
                    this.eventBus.off("switch-protyle", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On destroy-protyle",
                click: () => {
                    this.eventBus.on("destroy-protyle", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off destroy-protyle",
                click: () => {
                    this.eventBus.off("destroy-protyle", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On open-menu-doctree",
                click: () => {
                    this.eventBus.on("open-menu-doctree", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off open-menu-doctree",
                click: () => {
                    this.eventBus.off("open-menu-doctree", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On open-menu-blockref",
                click: () => {
                    this.eventBus.on("open-menu-blockref", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off open-menu-blockref",
                click: () => {
                    this.eventBus.off("open-menu-blockref", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On open-menu-fileannotationref",
                click: () => {
                    this.eventBus.on("open-menu-fileannotationref", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off open-menu-fileannotationref",
                click: () => {
                    this.eventBus.off("open-menu-fileannotationref", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On open-menu-tag",
                click: () => {
                    this.eventBus.on("open-menu-tag", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off open-menu-tag",
                click: () => {
                    this.eventBus.off("open-menu-tag", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On open-menu-link",
                click: () => {
                    this.eventBus.on("open-menu-link", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off open-menu-link",
                click: () => {
                    this.eventBus.off("open-menu-link", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On open-menu-image",
                click: () => {
                    this.eventBus.on("open-menu-image", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off open-menu-image",
                click: () => {
                    this.eventBus.off("open-menu-image", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On open-menu-av",
                click: () => {
                    this.eventBus.on("open-menu-av", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off open-menu-av",
                click: () => {
                    this.eventBus.off("open-menu-av", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On open-menu-content",
                click: () => {
                    this.eventBus.on("open-menu-content", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off open-menu-content",
                click: () => {
                    this.eventBus.off("open-menu-content", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On open-menu-breadcrumbmore",
                click: () => {
                    this.eventBus.on("open-menu-breadcrumbmore", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off open-menu-breadcrumbmore",
                click: () => {
                    this.eventBus.off("open-menu-breadcrumbmore", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On open-menu-inbox",
                click: () => {
                    this.eventBus.on("open-menu-inbox", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off open-menu-inbox",
                click: () => {
                    this.eventBus.off("open-menu-inbox", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On input-search",
                click: () => {
                    this.eventBus.on("input-search", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off input-search",
                click: () => {
                    this.eventBus.off("input-search", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On paste",
                click: () => {
                    this.eventBus.on("paste", this.eventBusPaste);
                }
            }, {
                icon: "iconClose",
                label: "Off paste",
                click: () => {
                    this.eventBus.off("paste", this.eventBusPaste);
                }
            }, {
                icon: "iconSelect",
                label: "On open-siyuan-url-plugin",
                click: () => {
                    this.eventBus.on("open-siyuan-url-plugin", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off open-siyuan-url-plugin",
                click: () => {
                    this.eventBus.off("open-siyuan-url-plugin", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On open-siyuan-url-block",
                click: () => {
                    this.eventBus.on("open-siyuan-url-block", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off open-siyuan-url-block",
                click: () => {
                    this.eventBus.off("open-siyuan-url-block", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On opened-notebook",
                click: () => {
                    this.eventBus.on("opened-notebook", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off opened-notebook",
                click: () => {
                    this.eventBus.off("opened-notebook", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On closed-notebook",
                click: () => {
                    this.eventBus.on("closed-notebook", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off closed-notebook",
                click: () => {
                    this.eventBus.off("closed-notebook", this.eventBusLog);
                }
            }]
        });
        menu.addSeparator();
        menu.addItem({
            icon: "iconSparkles",
            label: this.data[STORAGE_NAME].readonlyText || "Readonly",
            type: "readonly",
        });
        if (this.isMobile) {
            menu.fullscreen();
        } else {
            menu.open({
                x: rect.right,
                y: rect.bottom,
                isLeft: true,
            });
        }
    }

    private getEditor() {
        const editors = getAllEditor();
        if (editors.length === 0) {
            showMessage("please open doc first");
            return;
        }
        return editors[0];
    }
}

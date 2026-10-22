/**
 * Builds the static `index.html` that completes a kernel HTML export directory.
 *
 * The skeleton follows SiYuan's native export page (`app/src/protyle/export/index.ts`, `onExport`)
 * with the publish-specific simplifications: no plugin CSS, snippets, custom fonts, mobile extras,
 * PDF-only code, duplicate theme link, or bookmark-icon body class.
 */
import type { TemplateParams } from "./types";

const LOG_PREFIX = "[siyuan-plugin-publisher]";

/** Font shipped with SiYuan that keeps emoji rendering identical across platforms. */
const NOTO_EMOJI_FONT_PATH = "appearance/fonts/Noto-COLRv1-2.051/Noto-COLRv1.woff2";

/**
 * Defaults mirror the kernel constructors in `kernel/conf/appearance.go` and `kernel/conf/editor.go`.
 * They are only used when a live configuration field is missing, and each use is logged.
 */
const DEFAULT_CODE_BLOCK_THEME_LIGHT = "github";
const DEFAULT_CODE_BLOCK_THEME_DARK = "base16/dracula";
const DEFAULT_EDITOR_FONT_SIZE = 16;
const DEFAULT_CODE_LIGATURES = false;
const DEFAULT_AUTO_DIRECTION = false;
const DEFAULT_CODE_SYNTAX_HIGHLIGHT_LINE_NUM = false;
const DEFAULT_PLANTUML_SERVE_PATH = "https://www.plantuml.com/plantuml/svg/~1";
const DEFAULT_KATEX_MACROS = "{}";
const DEFAULT_ICON = "litheness";

/** Renderer UI strings needed by the export runtime (same subset as native `getExportLanguages`). */
const EXPORT_LANGUAGE_KEYS = new Set([
    "copy", "mindmap", "fontSize", "bold", "italic", "colorFont", "color", "undo", "redo", "fold", "collapse", "expand",
    "fullscreen", "exitFullscreen", "zoomIn", "zoomOut", "delete", "close", "connect", "text",
    "task", "taskStatusTodo", "taskStatusInProgress", "taskStatusDone", "taskStatusCanceled", "customTaskStatus",
    "expandLevel", "expandAll", "foldAll",
]);

interface AppearanceConfig {
    icon?: string;
    codeBlockThemeLight?: string;
    codeBlockThemeDark?: string;
}

interface EditorConfig {
    fontSize?: number;
    codeLigatures?: boolean;
    autoDirection?: boolean;
    codeSyntaxHighlightLineNum?: boolean;
    plantUMLServePath?: string;
    katexMacros?: string;
}

interface ExportRuntime {
    config?: {
        appearance?: AppearanceConfig;
        editor?: EditorConfig;
    };
    languages?: Record<string, unknown>;
}

interface Bootstrap {
    config: {
        appearance: {
            mode: number;
            icon: string;
            codeBlockThemeLight: string;
            codeBlockThemeDark: string;
        };
        editor: {
            codeLineWrap: boolean;
            autoDirection: boolean;
            fontSize: number;
            codeLigatures: boolean;
            plantUMLServePath: string;
            codeSyntaxHighlightLineNum: boolean;
            katexMacros: string;
        };
    };
    languages: Record<string, unknown>;
}

const NOTO_EMOJI_FONT_STYLE = `@font-face {
    font-family: "Emojis Additional";
    src: url("${NOTO_EMOJI_FONT_PATH}") format("woff2");
    font-display: swap;
}
@font-face {
    font-family: "Emojis Reset";
    src: url("${NOTO_EMOJI_FONT_PATH}") format("woff2");
    font-display: swap;
}
@font-face {
    font-family: "Emojis";
    src: url("${NOTO_EMOJI_FONT_PATH}") format("woff2");
    font-display: swap;
}`;

/**
 * Reads a live configuration value and falls back to the documented kernel default when it is absent.
 */
function readConfigValue<T>(value: T | undefined | null, path: string, fallback: T): T {
    if (value === undefined || value === null) {
        console.warn(`${LOG_PREFIX} ${path} is missing; using default ${JSON.stringify(fallback)}.`);
        return fallback;
    }
    return value;
}

function getRuntime(): ExportRuntime {
    const runtime = window.siyuan as ExportRuntime | undefined;
    if (!runtime || !runtime.config) {
        throw new Error(`${LOG_PREFIX} window.siyuan.config is unavailable; cannot build the publish HTML.`);
    }
    return runtime;
}

function getExportLanguages(languages: Record<string, unknown> | undefined): Record<string, unknown> {
    if (!languages) {
        console.warn(`${LOG_PREFIX} window.siyuan.languages is missing; renderer UI strings will be empty.`);
        return {};
    }

    const subset: Record<string, unknown> = {};
    Object.entries(languages).forEach(([key, value]) => {
        if (EXPORT_LANGUAGE_KEYS.has(key) || key.startsWith("listMindmap")) {
            subset[key] = value;
        }
    });
    return subset;
}

/**
 * Serializes a value for an inline `<script>` block and escapes `<` so a literal `</script>` in
 * content (for example KaTeX macros or UI strings) cannot terminate the script element.
 */
function serializeForScript(value: unknown): string {
    return JSON.stringify(value)
        .replace(/</g, "\\u003c")
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029");
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function buildBootstrap(runtime: ExportRuntime): Bootstrap {
    const appearance = runtime.config?.appearance;
    const editor = runtime.config?.editor;

    return {
        config: {
            appearance: {
                mode: 0,
                icon: readConfigValue(appearance?.icon,
                    "window.siyuan.config.appearance.icon", DEFAULT_ICON),
                codeBlockThemeLight: readConfigValue(appearance?.codeBlockThemeLight,
                    "window.siyuan.config.appearance.codeBlockThemeLight", DEFAULT_CODE_BLOCK_THEME_LIGHT),
                codeBlockThemeDark: readConfigValue(appearance?.codeBlockThemeDark,
                    "window.siyuan.config.appearance.codeBlockThemeDark", DEFAULT_CODE_BLOCK_THEME_DARK),
            },
            editor: {
                codeLineWrap: true,
                autoDirection: readConfigValue(editor?.autoDirection,
                    "window.siyuan.config.editor.autoDirection", DEFAULT_AUTO_DIRECTION),
                fontSize: readConfigValue(editor?.fontSize,
                    "window.siyuan.config.editor.fontSize", DEFAULT_EDITOR_FONT_SIZE),
                codeLigatures: readConfigValue(editor?.codeLigatures,
                    "window.siyuan.config.editor.codeLigatures", DEFAULT_CODE_LIGATURES),
                plantUMLServePath: readConfigValue(editor?.plantUMLServePath,
                    "window.siyuan.config.editor.plantUMLServePath", DEFAULT_PLANTUML_SERVE_PATH),
                codeSyntaxHighlightLineNum: readConfigValue(editor?.codeSyntaxHighlightLineNum,
                    "window.siyuan.config.editor.codeSyntaxHighlightLineNum", DEFAULT_CODE_SYNTAX_HIGHLIGHT_LINE_NUM),
                katexMacros: readConfigValue(editor?.katexMacros,
                    "window.siyuan.config.editor.katexMacros", DEFAULT_KATEX_MACROS),
            },
        },
        languages: getExportLanguages(runtime.languages),
    };
}

/**
 * Renders the publish artifact entry page.
 *
 * `content` is inserted verbatim because it is already rendered HTML from the kernel. Document names
 * and configuration values are HTML-escaped where they enter markup.
 */
export function buildIndexHtml(params: TemplateParams): string {
    const { content, docName, themeLight, themeDark, lang, version } = params;
    const runtime = getRuntime();
    const bootstrap = buildBootstrap(runtime);

    const safeVersion = escapeHtml(version);
    const safeLang = escapeHtml(lang);
    const safeThemeLight = escapeHtml(themeLight);
    const safeThemeDark = escapeHtml(themeDark);
    const safeDocName = escapeHtml(docName);
    const activeIcon = bootstrap.config.appearance.icon;
    const iconScripts = (activeIcon === "litheness" ? "" :
        `<script src="appearance/icons/litheness/icon.js?v=${safeVersion}"></script>`) +
        `<script src="appearance/icons/${escapeHtml(activeIcon)}/icon.js?v=${safeVersion}"></script>`;

    return `<!DOCTYPE html>
<html lang="${safeLang}" data-theme-mode="light" data-light-theme="${safeThemeLight}" data-dark-theme="${safeThemeDark}">
<head>
    <base href="">
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0"/>
    <meta name="mobile-web-app-capable" content="yes"/>
    <meta name="apple-mobile-web-app-status-bar-style" content="black">
    <link rel="stylesheet" type="text/css" id="baseStyle" href="stage/build/export/base.css?v=${safeVersion}"/>
    <link rel="stylesheet" type="text/css" id="themeDefaultStyle" href="appearance/themes/${safeThemeLight}/theme.css?v=${safeVersion}"/>
    <script src="stage/protyle/js/protyle-html.js?v=${safeVersion}"></script>
    <title>${safeDocName}</title>
    <style>
        body {font-family: var(--b3-font-family);background-color: var(--b3-theme-background);color: var(--b3-theme-on-background)}
        ${NOTO_EMOJI_FONT_STYLE}
    </style>
</head>
<body>
<div class="protyle-wysiwyg" id="preview" style="max-width:800px;margin:auto">${content}</div>
${iconScripts}
<script src="stage/build/export/protyle-method.js?v=${safeVersion}"></script>
<script src="stage/protyle/js/lute/lute.min.js?v=${safeVersion}"></script>
<script>
    window.siyuan = ${serializeForScript(bootstrap)};
    const previewElement = document.getElementById('preview');
    Protyle.highlightRender(previewElement, "stage/protyle");
    Protyle.setAutoDirection(previewElement, window.siyuan.config.editor.autoDirection);
    Protyle.mathRender(previewElement, "stage/protyle", false);
    Protyle.mermaidRender(previewElement, "stage/protyle");
    Protyle.flowchartRender(previewElement, "stage/protyle");
    Protyle.graphvizRender(previewElement, "stage/protyle");
    Protyle.chartRender(previewElement, "stage/protyle");
    Protyle.mindmapRender(previewElement, "stage/protyle");
    Protyle.abcRender(previewElement, "stage/protyle");
    Protyle.htmlRender(previewElement);
    Protyle.tabsRender(previewElement);
    Protyle.plantumlRender(previewElement, "stage/protyle");
    document.querySelectorAll(".protyle-action__copy").forEach((item) => {
        item.addEventListener("click", (event) => {
            navigator.clipboard.writeText(item.parentElement.nextElementSibling.textContent.trimEnd().replace(/\u00A0/g, " ").replace(/\u200D\`\`\`/g, "\`\`\`"));
            event.preventDefault();
            event.stopPropagation();
        });
    });
</script>
</body>
</html>`;
}

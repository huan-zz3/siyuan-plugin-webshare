/**
 * Shared types for the publish pipeline.
 */

/**
 * Values required to render the static `index.html` that accompanies a kernel HTML export.
 */
export interface TemplateParams {
    /** Body fragment produced by `/api/export/exportHTML`; inserted without escaping. */
    content: string;
    /** Document title; HTML-escaped before being inserted into `<title>`. */
    docName: string;
    /** Light theme name used for the theme stylesheet. */
    themeLight: string;
    /** Dark theme name written to `data-dark-theme`. */
    themeDark: string;
    /** Interface language written to the `<html lang>` attribute. */
    lang: string;
    /** SiYuan version used to bust static asset caches. */
    version: string;
}

/**
 * A self-contained static directory ready to be uploaded.
 */
export interface ExportArtifact {
    /** Kernel-created folder under `temp/export`, possibly containing `/` for encrypted notebooks. */
    folder: string;
    /** Absolute path of the artifact directory inside the workspace. */
    absoluteDir: string;
    /** Document name reported by the kernel export. */
    name: string;
}

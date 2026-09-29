import { utf8ToBase64 } from "../base64";
import type { ClipboardMeta } from "../types";

/**
 * - `figma-exact` mirrors the markup Figma writes on copy: bare sibling
 *   spans, a newline-terminated meta JSON, and a trailing plain-text span.
 * - `figit` mirrors `@figit/fig-kiwi`'s `composeClipboardHtml`, which wraps
 *   the spans in a `<div>` and is known to paste from Chrome.
 *
 * Both keep the `<!--(figma)…-->` markers inside attribute values; WebKit
 * strips real comment nodes from clipboard HTML.
 */
export type EnvelopeVariant = "figma-exact" | "figit";

export const DEFAULT_META: ClipboardMeta = {
  fileKey: "CONJURE",
  pasteID: 1,
  dataType: "scene",
};

export type ComposeOptions = {
  meta?: ClipboardMeta;
  variant?: EnvelopeVariant;
  /** Text for the trailing span in the `figma-exact` variant. */
  text?: string;
};

function escapeText(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function composeEnvelope(base64: string, options: ComposeOptions = {}): string {
  const { meta = DEFAULT_META, variant = "figma-exact", text = "" } = options;
  if (variant === "figit") {
    const metaB64 = utf8ToBase64(JSON.stringify(meta));
    return `<meta charset="utf-8"><div><span data-metadata="<!--(figmeta)${metaB64}(/figmeta)-->"></span><span data-buffer="<!--(figma)${base64}(/figma)-->"></span></div>`;
  }
  const metaB64 = utf8ToBase64(`${JSON.stringify(meta)}\n`);
  return `<meta charset="utf-8"><span data-metadata="<!--(figmeta)${metaB64}(/figmeta)-->"></span><span data-buffer="<!--(figma)${base64}(/figma)-->"></span><span style="white-space:pre-wrap;">${escapeText(text)}</span>`;
}

import { decodeClipboardHtml } from "../codec/decode";
import type { DecodedPayload } from "../types";

/**
 * A captured Figma payload used as the known-good baseline for authoring by
 * diff (PRD §9.2). Carries its own schema so re-encoding never loses fields.
 */
export type Template = DecodedPayload & { sourceHtml: string };

export function loadTemplate(html: string): Template {
  return { ...decodeClipboardHtml(html), sourceHtml: html };
}

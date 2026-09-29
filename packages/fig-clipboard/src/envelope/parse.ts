import { base64ToBytes, base64ToUtf8 } from "../base64";
import type { ClipboardMeta } from "../types";

const MARKERS = {
  figma: { start: "<!--(figma)", end: "(/figma)-->" },
  figmeta: { start: "<!--(figmeta)", end: "(/figmeta)-->" },
} as const;

type Marker = (typeof MARKERS)[keyof typeof MARKERS];

/**
 * Chrome ≥138 escapes `<` and `>` inside attribute values when serialising
 * clipboard HTML, so markers can arrive as `&lt;!--(figma)…--&gt;`.
 */
function normalizeMarkers(html: string): string {
  let out = html;
  for (const { start, end } of Object.values(MARKERS)) {
    out = out.replaceAll(`&lt;${start.slice(1)}`, start).replaceAll(`${end.slice(0, -1)}&gt;`, end);
  }
  return out;
}

function extract(normalized: string, marker: Marker): string | null {
  const start = normalized.indexOf(marker.start);
  if (start === -1) return null;
  const end = normalized.indexOf(marker.end, start);
  if (end === -1) return null;
  // Pretty-printed fixtures may wrap the base64 across lines.
  return normalized.slice(start + marker.start.length, end).replace(/\s+/g, "");
}

export function hasFigmaMarkers(html: string): boolean {
  return extract(normalizeMarkers(html), MARKERS.figma) !== null;
}

export type ParsedEnvelope = {
  fig: Uint8Array;
  meta: ClipboardMeta | null;
  /** True when the markers arrived entity-escaped. */
  escaped: boolean;
};

export function parseEnvelope(html: string): ParsedEnvelope {
  const normalized = normalizeMarkers(html);
  const figB64 = extract(normalized, MARKERS.figma);
  if (figB64 === null) {
    throw new Error("No Figma payload markers found in clipboard HTML");
  }
  const metaB64 = extract(normalized, MARKERS.figmeta);
  let meta: ClipboardMeta | null = null;
  if (metaB64 !== null) {
    try {
      meta = JSON.parse(base64ToUtf8(metaB64)) as ClipboardMeta;
    } catch {
      meta = null;
    }
  }
  return { fig: base64ToBytes(figB64), meta, escaped: normalized !== html };
}

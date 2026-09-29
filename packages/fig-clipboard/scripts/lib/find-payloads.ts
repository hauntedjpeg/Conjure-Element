import type { DecodedPayload } from "../../src/index";
import { decodeClipboardHtml, decodeFigBytes, hasFigmaMarkers } from "../../src/index";

export type FoundPayload = {
  type: string;
  form: "html-envelope" | "raw-fig-bytes";
  decoded: DecodedPayload;
  html: string | null;
};

const FIG_MAGIC = "fig-";

function tryText(bytes: Uint8Array): string | null {
  for (const encoding of ["utf-8", "utf-16le"] as const) {
    try {
      const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
      if (hasFigmaMarkers(text)) return text;
    } catch {
      // Not text in this encoding.
    }
  }
  return null;
}

/**
 * Look for a Figma payload in one pasteboard representation: either the HTML
 * envelope, or bare fig-kiwi bytes in a custom type.
 */
export function findPayload(type: string, bytes: Uint8Array): FoundPayload | null {
  const html = tryText(bytes);
  if (html !== null) {
    return { type, form: "html-envelope", decoded: decodeClipboardHtml(html), html };
  }
  const head = new TextDecoder().decode(bytes.subarray(0, 4));
  if (head === FIG_MAGIC) {
    return {
      type,
      form: "raw-fig-bytes",
      decoded: { meta: null, ...decodeFigBytes(bytes) },
      html: null,
    };
  }
  return null;
}

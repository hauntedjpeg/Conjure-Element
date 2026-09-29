import { decodeFigmaData } from "@figit/fig-kiwi";
import { parseEnvelope } from "../envelope/parse";
import type { Compression, DecodedPayload, FigMessage } from "../types";

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

function sniff(bytes: Uint8Array, offset: number): Compression {
  return ZSTD_MAGIC.every((byte, i) => bytes[offset + i] === byte) ? "zstd" : "deflate";
}

export function decodeFigBytes(fig: Uint8Array): Omit<DecodedPayload, "meta"> {
  const decoded = decodeFigmaData(fig);
  const view = new DataView(fig.buffer, fig.byteOffset, fig.byteLength);
  const schemaLength = view.getUint32(12, true);
  return {
    prelude: decoded.prelude,
    version: decoded.version,
    schema: decoded.schema,
    message: decoded.message as FigMessage,
    compression: {
      schema: sniff(fig, 16),
      data: sniff(fig, 16 + schemaLength + 4),
    },
    byteLength: fig.byteLength,
  };
}

export function decodeClipboardHtml(html: string): DecodedPayload {
  const { fig, meta } = parseEnvelope(html);
  return { meta, ...decodeFigBytes(fig) };
}

/** JSON replacer that keeps decoded payloads readable and diffable. */
export function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Uint8Array) {
    const hex = Array.from(value.subarray(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
    return { $bytes: value.length, head: hex };
  }
  return value;
}

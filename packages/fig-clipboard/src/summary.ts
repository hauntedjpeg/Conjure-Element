import { contentNodes } from "./message/scaffold";
import type { DecodedPayload } from "./types";

export type PayloadSummary = {
  dataType: string | null;
  metaKeys: string[];
  prelude: string;
  version: number;
  schemaTypes: number;
  compression: DecodedPayload["compression"];
  bytes: number;
  messageType: string;
  messageFields: string[];
  nodeCount: number;
  content: { type: string; name: string; fields: string[] }[];
};

/** The facts about a payload that the probe protocol asks you to record. */
export function summarize(decoded: DecodedPayload): PayloadSummary {
  return {
    dataType: decoded.meta?.dataType ?? null,
    metaKeys: Object.keys(decoded.meta ?? {}),
    prelude: decoded.prelude,
    version: decoded.version,
    schemaTypes: decoded.schema.type_count,
    compression: decoded.compression,
    bytes: decoded.byteLength,
    messageType: decoded.message.type,
    messageFields: Object.keys(decoded.message),
    nodeCount: decoded.message.nodeChanges?.length ?? 0,
    content: contentNodes(decoded.message).map((node) => ({
      type: String(node.type ?? "?"),
      name: String(node.name ?? ""),
      fields: Object.keys(node),
    })),
  };
}

export function formatSummary(summary: PayloadSummary): string {
  const lines = [
    `dataType      ${summary.dataType ?? "(no figmeta)"}`,
    `meta keys     ${summary.metaKeys.join(", ") || "-"}`,
    `envelope      ${summary.prelude} v${summary.version}, ${summary.bytes} bytes`,
    `schema        ${summary.schemaTypes} types (${summary.compression.schema})`,
    `message       ${summary.messageType} (${summary.compression.data})`,
    `message keys  ${summary.messageFields.join(", ")}`,
    `nodes         ${summary.nodeCount} total, ${summary.content.length} content`,
  ];
  for (const node of summary.content) {
    lines.push(`  ${node.type} "${node.name}"`);
    lines.push(`    ${node.fields.join(", ")}`);
  }
  return lines.join("\n");
}

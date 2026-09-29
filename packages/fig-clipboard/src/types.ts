import type { Schema } from "@figit/fig-kiwi";

export type { Field, Schema, TypeDef } from "@figit/fig-kiwi";

export type Guid = { sessionID: number; localID: number };

export type ParentIndex = { guid: Guid; position: string };

export type Matrix = {
  m00: number;
  m01: number;
  m02: number;
  m10: number;
  m11: number;
  m12: number;
};

export type Color = { r: number; g: number; b: number; a: number };

/**
 * A Kiwi `NodeChange`. Only the structural fields are typed; every visual
 * field is optional on the wire, which is what makes sparse payloads possible.
 */
export type NodeChange = Record<string, unknown> & {
  guid: Guid;
  phase?: string;
  parentIndex?: ParentIndex;
  type?: string;
  name?: string;
};

/** The root Kiwi `Message` carried by a clipboard payload. */
export type FigMessage = Record<string, unknown> & {
  type: string;
  nodeChanges?: NodeChange[];
  blobs?: { bytes: Uint8Array }[];
};

/**
 * `(figmeta)` JSON. Figma itself writes more keys than the three required
 * ones, and an unknown `dataType` is exactly what the probe is looking for,
 * so nothing here is narrowed to a literal.
 */
export type ClipboardMeta = {
  fileKey: string;
  pasteID: number;
  dataType: string;
  [key: string]: unknown;
};

export type Compression = "deflate" | "zstd";

export type DecodedPayload = {
  meta: ClipboardMeta | null;
  prelude: string;
  version: number;
  schema: Schema;
  message: FigMessage;
  compression: { schema: Compression; data: Compression };
  byteLength: number;
};

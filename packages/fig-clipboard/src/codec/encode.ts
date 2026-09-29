import { KiwiWriter, SCHEMA } from "@figit/fig-kiwi";
import { deflateSync } from "fflate";
import { bytesToBase64 } from "../base64";
import type { Schema, TypeDef } from "../types";

const PRIM = {
  BOOL: -1,
  BYTE: -2,
  INT: -3,
  UINT: -4,
  FLOAT: -5,
  STRING: -6,
  INT64: -7,
  UINT64: -8,
} as const;
const ENUM = 0;
const STRUCT = 1;
const MESSAGE = 2;
const MAGIC = new TextEncoder().encode("fig-kiwi");
const ROOT_TYPE_NAME = "Message";

export type EncodedPayload = { figBytes: Uint8Array; base64: string; size: number };

export type EncodeOptions = {
  /** Header version. Defaults to the schema's own version. */
  version?: number;
};

function fail(path: string, message: string): never {
  throw new Error(`${message} at ${path}`);
}

function encodePrimitive(w: KiwiWriter, datatype: number, value: unknown, path: string): void {
  if (datatype === PRIM.BOOL) {
    w.bool(Boolean(value));
    return;
  }
  if (datatype === PRIM.STRING) {
    if (typeof value !== "string") fail(path, `Expected string, got ${typeof value}`);
    w.string(value);
    return;
  }
  if (typeof value !== "number") fail(path, `Expected number, got ${typeof value}`);
  switch (datatype) {
    case PRIM.BYTE:
      w.byte(value);
      break;
    case PRIM.INT:
      w.int(value);
      break;
    case PRIM.UINT:
      w.uint(value);
      break;
    case PRIM.FLOAT:
      w.float(value);
      break;
    case PRIM.INT64:
      w.int64(value);
      break;
    case PRIM.UINT64:
      w.uint64(value);
      break;
    default:
      fail(path, `Unknown primitive datatype ${datatype}`);
  }
}

function encodeArray(
  w: KiwiWriter,
  types: TypeDef[],
  datatype: number,
  value: unknown,
  path: string,
): void {
  if (datatype === PRIM.BYTE) {
    const bytes =
      value instanceof Uint8Array ? value : Array.isArray(value) ? new Uint8Array(value) : null;
    if (!bytes) fail(path, "Expected byte array");
    w.uint(bytes.length);
    w.bytes(bytes);
    return;
  }
  if (!Array.isArray(value)) fail(path, `Expected array, got ${typeof value}`);
  w.uint(value.length);
  value.forEach((item, i) => {
    encodeType(w, types, datatype, item, false, `${path}[${i}]`);
  });
}

function encodeEnum(w: KiwiWriter, type: TypeDef, value: unknown, path: string): void {
  // The decoder yields the raw id for enum values its schema does not name.
  if (typeof value === "number") {
    w.uint(value);
    return;
  }
  const id = Object.keys(type.fields).find((key) => type.fields[key]?.name === value);
  if (id === undefined) fail(path, `Unknown enum value '${String(value)}' for ${type.name}`);
  w.uint(Number.parseInt(id, 10));
}

function asObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null)
    fail(path, `Expected object, got ${typeof value}`);
  return value as Record<string, unknown>;
}

function encodeStruct(
  w: KiwiWriter,
  types: TypeDef[],
  type: TypeDef,
  value: unknown,
  path: string,
): void {
  const obj = asObject(value, path);
  const count = Object.keys(type.fields).length;
  for (let id = 1; id <= count; id += 1) {
    const field = type.fields[String(id)];
    if (!field) fail(path, `Field ${id} missing in struct ${type.name}`);
    const v = obj[field.name];
    if (v === undefined)
      fail(path, `Missing required field '${field.name}' in struct ${type.name}`);
    encodeType(w, types, field.datatype, v, field.array, `${path}.${field.name}`);
  }
}

function encodeMessage(
  w: KiwiWriter,
  types: TypeDef[],
  type: TypeDef,
  value: unknown,
  path: string,
): void {
  const obj = asObject(value, path);
  for (const [id, field] of Object.entries(type.fields)) {
    const v = obj[field.name];
    if (v === undefined) continue;
    w.uint(Number.parseInt(id, 10));
    encodeType(w, types, field.datatype, v, field.array, `${path}.${field.name}`);
  }
  w.uint(0);
}

function encodeType(
  w: KiwiWriter,
  types: TypeDef[],
  datatype: number,
  value: unknown,
  isArray: boolean,
  path: string,
): void {
  if (isArray) {
    encodeArray(w, types, datatype, value, path);
    return;
  }
  if (datatype < 0) {
    encodePrimitive(w, datatype, value, path);
    return;
  }
  const type = types[datatype];
  if (!type) fail(path, `Type ${datatype} not in schema`);
  switch (type.kind) {
    case ENUM:
      encodeEnum(w, type, value, path);
      break;
    case STRUCT:
      encodeStruct(w, types, type, value, path);
      break;
    case MESSAGE:
      encodeMessage(w, types, type, value, path);
      break;
    default:
      fail(path, `Unknown kind ${type.kind} for ${type.name}`);
  }
}

function writeSchema(w: KiwiWriter, types: TypeDef[]): void {
  w.uint(types.length);
  for (const type of types) {
    w.string(type.name);
    w.byte(type.kind);
    const entries = Object.entries(type.fields);
    w.uint(entries.length);
    for (const [id, field] of entries) {
      w.string(field.name);
      w.int(field.datatype);
      w.bool(field.array);
      w.uint(Number.parseInt(id, 10));
    }
  }
}

function uint32LE(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * Encode against an explicit schema, normally the one embedded in a captured
 * payload. This is what keeps clone-and-mutate faithful when Figma's schema
 * is newer than the bundled one. Both chunks are raw deflate, which Figma
 * accepts even though it now writes zstd itself.
 */
export function encodeWithSchema(
  message: unknown,
  schema: Schema,
  options: EncodeOptions = {},
): EncodedPayload {
  const rootIndex = schema.types.findIndex((t) => t.name === ROOT_TYPE_NAME);
  if (rootIndex === -1) throw new Error(`No root '${ROOT_TYPE_NAME}' type in schema`);

  const schemaWriter = new KiwiWriter();
  writeSchema(schemaWriter, schema.types);
  const schemaChunk = deflateSync(schemaWriter.getBytes(), { level: 6 });

  const dataWriter = new KiwiWriter();
  encodeType(dataWriter, schema.types, rootIndex, message, false, "Message");
  const dataChunk = deflateSync(dataWriter.getBytes(), { level: 6 });

  const figBytes = concat([
    MAGIC,
    uint32LE(options.version ?? schema.version),
    uint32LE(schemaChunk.length),
    schemaChunk,
    uint32LE(dataChunk.length),
    dataChunk,
  ]);
  return { figBytes, base64: bytesToBase64(figBytes), size: figBytes.length };
}

/** Encode against the schema bundled with `@figit/fig-kiwi`. */
export function encodeMessageBundled(message: unknown, options?: EncodeOptions): EncodedPayload {
  return encodeWithSchema(message, SCHEMA, options);
}

export const BUNDLED_SCHEMA: Schema = SCHEMA;

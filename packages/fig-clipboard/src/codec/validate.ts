import type { Schema, TypeDef } from "../types";

const ENUM = 0;
const STRUCT = 1;
const BYTE = -2;
const ROOT_TYPE_NAME = "Message";

export type ValidationIssue = {
  path: string;
  kind: "unknown-field" | "unknown-enum" | "missing-struct-field" | "type-mismatch";
  detail: string;
};

/**
 * Report everything in `message` that an encoder using `schema` would drop
 * or reject. Kiwi encoders iterate the schema's fields, so a field the schema
 * does not name vanishes silently; this makes that loss visible.
 */
export function validateMessage(message: unknown, schema: Schema): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const root = schema.types.find((t) => t.name === ROOT_TYPE_NAME);
  if (!root) {
    return [{ path: "", kind: "type-mismatch", detail: `No root '${ROOT_TYPE_NAME}' type` }];
  }
  visit(message, root.index, false, "Message", schema.types, issues);
  return issues;
}

function visit(
  value: unknown,
  datatype: number,
  isArray: boolean,
  path: string,
  types: TypeDef[],
  issues: ValidationIssue[],
): void {
  if (isArray) {
    if (datatype === BYTE) {
      if (!(value instanceof Uint8Array) && !Array.isArray(value)) {
        issues.push({ path, kind: "type-mismatch", detail: "expected byte array" });
      }
      return;
    }
    if (!Array.isArray(value)) {
      issues.push({ path, kind: "type-mismatch", detail: "expected array" });
      return;
    }
    value.forEach((item, i) => {
      visit(item, datatype, false, `${path}[${i}]`, types, issues);
    });
    return;
  }
  if (datatype < 0) return;
  const type = types[datatype];
  if (!type) {
    issues.push({ path, kind: "type-mismatch", detail: `type ${datatype} not in schema` });
    return;
  }
  if (type.kind === ENUM) {
    const known = Object.values(type.fields).some((f) => f.name === value);
    if (!known) {
      issues.push({
        path,
        kind: "unknown-enum",
        detail: `${type.name} has no value '${String(value)}'`,
      });
    }
    return;
  }
  if (typeof value !== "object" || value === null) {
    issues.push({ path, kind: "type-mismatch", detail: `expected ${type.name} object` });
    return;
  }
  const obj = value as Record<string, unknown>;
  const fields = Object.values(type.fields);
  const byName = new Map(fields.map((f) => [f.name, f]));
  for (const [key, child] of Object.entries(obj)) {
    if (child === undefined) continue;
    const field = byName.get(key);
    if (!field) {
      issues.push({
        path: `${path}.${key}`,
        kind: "unknown-field",
        detail: `${type.name} has no field '${key}'`,
      });
      continue;
    }
    visit(child, field.datatype, field.array, `${path}.${key}`, types, issues);
  }
  // Message fields are all optional; only structs require every field.
  if (type.kind === STRUCT) {
    for (const field of fields) {
      if (obj[field.name] === undefined) {
        issues.push({
          path: `${path}.${field.name}`,
          kind: "missing-struct-field",
          detail: `struct ${type.name} requires '${field.name}'`,
        });
      }
    }
  }
}

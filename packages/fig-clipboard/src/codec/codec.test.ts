import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { composeEnvelope } from "../envelope/compose";
import { contentNodes } from "../message/scaffold";
import { syntheticSource } from "../probes";
import { decodeClipboardHtml, decodeFigBytes } from "./decode";
import { BUNDLED_SCHEMA, encodeMessageBundled, encodeWithSchema } from "./encode";
import { validateMessage } from "./validate";

const captured = readFileSync(
  new URL("../../fixtures/vendor/two-boxes.captured.html", import.meta.url),
  "utf8",
);

describe("decode", () => {
  it("reads a payload copied out of Figma", () => {
    const decoded = decodeClipboardHtml(captured);
    expect(decoded.prelude).toBe("fig-kiwi");
    expect(decoded.version).toBe(106);
    expect(decoded.meta?.dataType).toBe("scene");
    expect(decoded.message.type).toBe("NODE_CHANGES");
    expect(decoded.compression).toEqual({ schema: "deflate", data: "zstd" });
    const names = contentNodes(decoded.message).map((node) => node.name);
    expect(names[0]).toBe("Two Boxes");
    expect(names).toHaveLength(5);
  });
});

describe("encode", () => {
  it("round-trips an authored message through the bundled schema", () => {
    const message = syntheticSource("Round trip");
    const { figBytes } = encodeMessageBundled(message);
    const decoded = decodeFigBytes(figBytes);
    expect(decoded.compression).toEqual({ schema: "deflate", data: "deflate" });
    const [node] = contentNodes(decoded.message);
    expect(node?.type).toBe("ROUNDED_RECTANGLE");
    expect(node?.cornerRadius).toBe(24);
    expect(node?.size).toEqual({ x: 120, y: 80 });
    expect(node?.effects).toHaveLength(1);
  });

  it("re-encodes a captured payload with its own schema without loss", () => {
    const first = decodeClipboardHtml(captured);
    const { base64 } = encodeWithSchema(first.message, first.schema);
    const second = decodeClipboardHtml(composeEnvelope(base64, { meta: first.meta ?? undefined }));
    expect(second.message).toEqual(first.message);
    expect(second.schema.type_count).toBe(first.schema.type_count);
    expect(second.version).toBe(first.version);
  });

  it("names the path of a value it cannot encode", () => {
    const message = syntheticSource("Bad");
    const node = contentNodes(message)[0];
    if (node) node.strokeAlign = "SIDEWAYS";
    expect(() => encodeMessageBundled(message)).toThrow(/SIDEWAYS.*nodeChanges\[2\]\.strokeAlign/);
  });
});

describe("validate", () => {
  it("passes an authored message", () => {
    expect(validateMessage(syntheticSource("Clean"), BUNDLED_SCHEMA)).toEqual([]);
  });

  it("passes a captured message against its own schema", () => {
    const decoded = decodeClipboardHtml(captured);
    expect(validateMessage(decoded.message, decoded.schema)).toEqual([]);
  });

  it("reports fields the schema would silently drop", () => {
    const message = syntheticSource("Dropped");
    const node = contentNodes(message)[0];
    if (node) node.notARealField = 1;
    expect(validateMessage(message, BUNDLED_SCHEMA)).toEqual([
      {
        path: "Message.nodeChanges[2].notARealField",
        kind: "unknown-field",
        detail: "NodeChange has no field 'notARealField'",
      },
    ]);
  });

  it("reports unknown enum values and incomplete structs", () => {
    const message = syntheticSource("Broken");
    const node = contentNodes(message)[0];
    if (node) {
      node.blendMode = "NOPE";
      node.size = { x: 1 };
    }
    const kinds = validateMessage(message, BUNDLED_SCHEMA).map((issue) => issue.kind);
    expect(kinds).toEqual(["missing-struct-field", "unknown-enum"]);
  });
});

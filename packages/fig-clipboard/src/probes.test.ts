import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeClipboardHtml } from "./codec/decode";
import { BUNDLED_SCHEMA } from "./codec/encode";
import { validateMessage } from "./codec/validate";
import { contentNodes, positionAt } from "./message/scaffold";
import { buildProbe, PROBES } from "./probes";
import { loadTemplate } from "./template/load";
import { IDENTITY_FIELDS, VISUAL_FIELDS } from "./template/sparsify";

const captured = readFileSync(
  new URL("../fixtures/vendor/two-boxes.captured.html", import.meta.url),
  "utf8",
);

const fieldsOf = (html: string) =>
  Object.keys(contentNodes(decodeClipboardHtml(html).message)[0] ?? {}).sort();

describe("synthetic probes", () => {
  it("N1 is a complete rectangle", () => {
    const probe = buildProbe("N1");
    expect(probe.source).toBe("synthetic");
    expect(probe.dropped).toEqual([]);
    const [node] = contentNodes(decodeClipboardHtml(probe.html).message);
    expect(node).toMatchObject({ type: "ROUNDED_RECTANGLE", name: "Conjure N1" });
  });

  it.each([
    ["P1", ["effects"]],
    ["P2", ["fillPaints"]],
    ["P3", ["cornerRadius"]],
    ["P4", []],
  ] as const)("%s carries only %j beyond identity and geometry", (id, kept) => {
    const probe = buildProbe(id);
    expect(fieldsOf(probe.html)).toEqual(
      [...IDENTITY_FIELDS, "size", "transform", "visible", ...kept].sort(),
    );
  });

  it("can strip geometry too", () => {
    const probe = buildProbe("P3", { stripGeometry: true });
    expect(fieldsOf(probe.html)).toEqual([...IDENTITY_FIELDS, "cornerRadius"].sort());
  });

  it("refuses template-only probes without a capture", () => {
    expect(() => buildProbe("R1")).toThrow(/load a capture/);
    expect(() => buildProbe("R2")).toThrow(/load a capture/);
  });

  it("only names visual fields the bundled schema knows", () => {
    const node = Object.fromEntries(VISUAL_FIELDS.map((field) => [field, undefined]));
    const nodeChange = BUNDLED_SCHEMA.types.find((type) => type.name === "NodeChange");
    const known = new Set(Object.values(nodeChange?.fields ?? {}).map((field) => field.name));
    expect(Object.keys(node).filter((field) => !known.has(field))).toEqual([]);
  });
});

describe("template probes", () => {
  const template = loadTemplate(captured);

  it("N1 stays synthetic even with a template loaded", () => {
    expect(buildProbe("N1", { template }).source).toBe("synthetic");
  });

  it("R1 replays the capture byte for byte", () => {
    expect(buildProbe("R1", { template }).html).toBe(captured);
  });

  it("R2 re-encodes to an equal message", () => {
    const probe = buildProbe("R2", { template });
    expect(probe.dropped).toEqual([]);
    const decoded = decodeClipboardHtml(probe.html);
    expect(decoded.message).toEqual(template.message);
    expect(decoded.meta).toEqual(template.meta);
  });

  it("P2 sparsifies every content node and leaves the scaffold alone", () => {
    const probe = buildProbe("P2", { template });
    const decoded = decodeClipboardHtml(probe.html);
    expect(validateMessage(decoded.message, decoded.schema)).toEqual([]);
    expect(decoded.message.nodeChanges?.[0]).toEqual(template.message.nodeChanges?.[0]);
    for (const node of contentNodes(decoded.message)) {
      expect(Object.keys(node)).not.toContain("strokeWeight");
      expect(Object.keys(node)).not.toContain("cornerRadius");
    }
  });
});

describe("probe matrix", () => {
  it("covers the PRD §9.3 rows", () => {
    expect(PROBES.map((probe) => probe.id)).toEqual([
      "N1",
      "R1",
      "R2",
      "P1",
      "P2",
      "P3",
      "P4",
      "P5",
    ]);
  });
});

describe("positionAt", () => {
  it("sorts lexicographically in index order", () => {
    const positions = Array.from({ length: 300 }, (_, i) => positionAt(i, 300));
    expect([...positions].sort()).toEqual(positions);
    expect(new Set(positions).size).toBe(300);
  });
});

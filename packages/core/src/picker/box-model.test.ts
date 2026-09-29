import { describe, expect, it } from "vitest";
import { boxModel, readBoxEdges } from "./box-model";

const zero = { top: 0, right: 0, bottom: 0, left: 0 };

describe("boxModel", () => {
  it("nests the four boxes", () => {
    const model = boxModel(
      { x: 100, y: 50, width: 200, height: 80 },
      {
        margin: { top: 10, right: 20, bottom: 30, left: 40 },
        border: { top: 1, right: 2, bottom: 3, left: 4 },
        padding: { top: 5, right: 6, bottom: 7, left: 8 },
      },
    );
    expect(model.margin).toEqual({ x: 60, y: 40, width: 260, height: 120 });
    expect(model.border).toEqual({ x: 100, y: 50, width: 200, height: 80 });
    expect(model.padding).toEqual({ x: 104, y: 51, width: 194, height: 76 });
    expect(model.content).toEqual({ x: 112, y: 56, width: 180, height: 64 });
  });

  it("treats negative margins as no band", () => {
    const model = boxModel(
      { x: 10, y: 10, width: 50, height: 50 },
      { margin: { top: -20, right: 5, bottom: 0, left: -5 }, border: zero, padding: zero },
    );
    expect(model.margin).toEqual({ x: 10, y: 10, width: 55, height: 50 });
  });

  it("never produces a negative size", () => {
    const model = boxModel(
      { x: 0, y: 0, width: 10, height: 4 },
      {
        margin: zero,
        border: { top: 3, right: 3, bottom: 3, left: 3 },
        padding: { top: 9, right: 9, bottom: 9, left: 9 },
      },
    );
    expect(model.padding).toEqual({ x: 3, y: 3, width: 4, height: 0 });
    expect(model.content.width).toBe(0);
    expect(model.content.height).toBe(0);
  });

  it("does not alias the border box", () => {
    const rect = { x: 1, y: 2, width: 3, height: 4 };
    const model = boxModel(rect, { margin: zero, border: zero, padding: zero });
    expect(model.border).toEqual(rect);
    expect(model.border).not.toBe(rect);
  });
});

describe("readBoxEdges", () => {
  it("reads pixel values and tolerates anything else", () => {
    const values: Record<string, string> = {
      "margin-top": "12px",
      "margin-left": "auto",
      "border-top-width": "1.5px",
      "padding-right": "0.25px",
    };
    const edges = readBoxEdges({ getPropertyValue: (name) => values[name] ?? "" });
    expect(edges.margin).toEqual({ top: 12, right: 0, bottom: 0, left: 0 });
    expect(edges.border.top).toBe(1.5);
    expect(edges.padding.right).toBe(0.25);
  });
});

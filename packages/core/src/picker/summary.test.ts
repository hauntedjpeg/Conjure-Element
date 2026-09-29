import { describe, expect, it } from "vitest";
import { selectorLabel, sizeLabel } from "./summary";

describe("selectorLabel", () => {
  it("writes tag, id and classes", () => {
    expect(selectorLabel({ tag: "button", id: "save", classes: ["btn", "primary"] })).toBe(
      "button#save.btn.primary",
    );
  });

  it("omits what is absent", () => {
    expect(selectorLabel({ tag: "div", id: null, classes: [] })).toBe("div");
  });

  it("counts the classes it leaves out", () => {
    expect(selectorLabel({ tag: "a", id: null, classes: ["a", "b", "c", "d", "e"] })).toBe(
      "a.a.b.c +2",
    );
    expect(selectorLabel({ tag: "a", id: null, classes: ["a", "b"] }, 5)).toBe("a.a.b");
  });
});

describe("sizeLabel", () => {
  it("rounds to two decimals and drops trailing zeros", () => {
    expect(sizeLabel({ width: 120, height: 40.5 })).toBe("120 × 40.5");
    expect(sizeLabel({ width: 33.333333, height: 0.004 })).toBe("33.33 × 0");
  });
});
